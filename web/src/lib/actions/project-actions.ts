import { prisma } from '@/lib/prisma'
import type {
  CreateProjectInput,
  UpdateProjectInput,
  PhaseChangeRequestInput,
  PhaseChangeReviewInput,
  DirectPhaseChangeInput,
  CreateEnhancementInput,
  ListProjectsQuery,
} from '@/lib/validations/project'
import type { Prisma } from '@/generated/prisma/client'

const APPROVAL_EMAIL = 'scott.schatz@townsquaremedia.com'

// ============================================================
// CREATE
// ============================================================

export async function createProject(input: CreateProjectInput, developerId: string) {
  const { repos, claudePaths, authorizationDate, expectedCompletion, ...fields } = input

  const project = await prisma.project.create({
    data: {
      ...fields,
      authorizationDate: authorizationDate ? new Date(authorizationDate) : null,
      expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
      createdById: developerId,
      repos: {
        create: repos.map((r) => ({
          repoPath: r.repoPath,
          repoUrl: r.repoUrl ?? null,
        })),
      },
      claudePaths: {
        create: claudePaths.map((c) => ({
          claudePath: c.claudePath,
          localPath: c.localPath,
        })),
      },
    },
    include: { repos: true, claudePaths: true },
  })

  // Record creation in history
  await prisma.projectHistory.create({
    data: {
      projectId: project.id,
      changedById: developerId,
      field: '_created',
      oldValue: null,
      newValue: project.name,
    },
  })

  return project
}

// ============================================================
// UPDATE (non-phase fields)
// ============================================================

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  developerId: string
) {
  const existing = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { repos: true, claudePaths: true },
  })

  const { repos, claudePaths, authorizationDate, expectedCompletion, goLiveDate, ...scalarFields } = input

  // Build scalar update data and diff for history
  const updateData: Prisma.ProjectUpdateInput = {}
  const historyEntries: { field: string; oldValue: string | null; newValue: string | null }[] = []

  // Diff scalar fields
  const fieldMap: Record<string, keyof typeof existing> = {
    name: 'name',
    description: 'description',
    businessJustification: 'businessJustification',
    managementAuthorized: 'managementAuthorized',
    probableToComplete: 'probableToComplete',
    developmentUncertainty: 'developmentUncertainty',
    status: 'status',
    authorizationEvidence: 'authorizationEvidence',
  }

  for (const [inputKey, existingKey] of Object.entries(fieldMap)) {
    const newVal = scalarFields[inputKey as keyof typeof scalarFields]
    if (newVal !== undefined) {
      const oldVal = existing[existingKey]
      if (String(newVal ?? '') !== String(oldVal ?? '')) {
        ;(updateData as Record<string, unknown>)[inputKey] = newVal
        historyEntries.push({
          field: inputKey,
          oldValue: oldVal == null ? null : String(oldVal),
          newValue: newVal == null ? null : String(newVal),
        })
      }
    }
  }

  // Date fields
  if (authorizationDate !== undefined) {
    const newDate = authorizationDate ? new Date(authorizationDate) : null
    const oldDate = existing.authorizationDate
    if (newDate?.toISOString() !== oldDate?.toISOString()) {
      updateData.authorizationDate = newDate
      historyEntries.push({
        field: 'authorizationDate',
        oldValue: oldDate?.toISOString() ?? null,
        newValue: newDate?.toISOString() ?? null,
      })
    }
  }
  if (expectedCompletion !== undefined) {
    const newDate = expectedCompletion ? new Date(expectedCompletion) : null
    const oldDate = existing.expectedCompletion
    if (newDate?.toISOString() !== oldDate?.toISOString()) {
      updateData.expectedCompletion = newDate
      historyEntries.push({
        field: 'expectedCompletion',
        oldValue: oldDate?.toISOString() ?? null,
        newValue: newDate?.toISOString() ?? null,
      })
    }
  }
  if (goLiveDate !== undefined) {
    const newDate = goLiveDate ? new Date(goLiveDate) : null
    const oldDate = existing.goLiveDate
    if (newDate?.toISOString() !== oldDate?.toISOString()) {
      updateData.goLiveDate = newDate
      historyEntries.push({
        field: 'goLiveDate',
        oldValue: oldDate?.toISOString() ?? null,
        newValue: newDate?.toISOString() ?? null,
      })
    }
  }

  // Apply scalar update + history in transaction
  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: updateData,
      include: { repos: true, claudePaths: true },
    })

    if (historyEntries.length > 0) {
      await tx.projectHistory.createMany({
        data: historyEntries.map((h) => ({
          projectId,
          changedById: developerId,
          ...h,
        })),
      })
    }

    // Sync repos if provided (replace strategy)
    if (repos !== undefined) {
      await tx.projectRepo.deleteMany({ where: { projectId } })
      if (repos.length > 0) {
        await tx.projectRepo.createMany({
          data: repos.map((r) => ({
            projectId,
            repoPath: r.repoPath,
            repoUrl: r.repoUrl ?? null,
          })),
        })
      }
      await tx.projectHistory.create({
        data: {
          projectId,
          changedById: developerId,
          field: 'repos',
          oldValue: JSON.stringify(existing.repos.map((r) => r.repoPath)),
          newValue: JSON.stringify(repos.map((r) => r.repoPath)),
        },
      })
    }

    // Sync claude paths if provided (replace strategy)
    if (claudePaths !== undefined) {
      await tx.projectClaudePath.deleteMany({ where: { projectId } })
      if (claudePaths.length > 0) {
        await tx.projectClaudePath.createMany({
          data: claudePaths.map((c) => ({
            projectId,
            claudePath: c.claudePath,
            localPath: c.localPath,
          })),
        })
      }
      await tx.projectHistory.create({
        data: {
          projectId,
          changedById: developerId,
          field: 'claudePaths',
          oldValue: JSON.stringify(existing.claudePaths.map((c) => c.localPath)),
          newValue: JSON.stringify(claudePaths.map((c) => c.localPath)),
        },
      })
    }

    return updated
  })

  // Re-fetch with updated relations
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { repos: true, claudePaths: true },
  })
}

// ============================================================
// DELETE (soft delete → status='abandoned')
// ============================================================

export async function deleteProject(projectId: string, developerId: string) {
  const existing = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { status: 'abandoned' },
    })

    await tx.projectHistory.create({
      data: {
        projectId,
        changedById: developerId,
        field: 'status',
        oldValue: existing.status,
        newValue: 'abandoned',
      },
    })

    return updated
  })

  return project
}

// ============================================================
// GET / LIST
// ============================================================

export async function getProject(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      repos: true,
      claudePaths: true,
      history: {
        orderBy: { changedAt: 'desc' },
        include: { changedBy: { select: { displayName: true, email: true } } },
      },
      phaseChangeRequests: {
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { displayName: true, email: true } },
          reviewedBy: { select: { displayName: true, email: true } },
        },
      },
      createdBy: { select: { displayName: true, email: true } },
    },
  })
}

export async function listProjects(query: ListProjectsQuery = {}) {
  const where: Prisma.ProjectWhereInput = {}

  if (query.status) {
    where.status = query.status
  } else {
    // By default exclude abandoned projects
    where.status = { not: 'abandoned' }
  }

  if (query.phase) {
    where.phase = query.phase
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  return prisma.project.findMany({
    where,
    include: {
      repos: true,
      claudePaths: true,
      _count: {
        select: {
          phaseChangeRequests: { where: { status: 'pending' } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

// ============================================================
// PHASE CHANGE WORKFLOW
// ============================================================

export async function requestPhaseChange(
  projectId: string,
  input: PhaseChangeRequestInput,
  developerId: string
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  if (project.phase === input.requestedPhase) {
    throw new Error(`Project is already in the "${input.requestedPhase}" phase`)
  }

  // Check no pending request already exists
  const pendingRequest = await prisma.phaseChangeRequest.findFirst({
    where: { projectId, status: 'pending' },
  })
  if (pendingRequest) {
    throw new Error('A phase change request is already pending for this project')
  }

  const request = await prisma.phaseChangeRequest.create({
    data: {
      projectId,
      requestedById: developerId,
      currentPhase: project.phase,
      requestedPhase: input.requestedPhase,
      reason: input.reason,
      status: 'pending',
    },
    include: {
      project: { select: { name: true } },
      requestedBy: { select: { displayName: true, email: true } },
    },
  })

  // TODO: Send approval email to APPROVAL_EMAIL (Phase 2.4)

  return request
}

export async function approvePhaseChange(
  projectId: string,
  requestId: string,
  input: PhaseChangeReviewInput,
  reviewerId: string,
  reviewerEmail: string
) {
  // Enforce: only admin with the designated approval email
  if (reviewerEmail !== APPROVAL_EMAIL) {
    throw new Error(`Only ${APPROVAL_EMAIL} can approve phase changes`)
  }

  const request = await prisma.phaseChangeRequest.findUniqueOrThrow({
    where: { id: requestId },
  })

  if (request.projectId !== projectId) {
    throw new Error('Phase change request does not belong to this project')
  }
  if (request.status !== 'pending') {
    throw new Error(`Request has already been ${request.status}`)
  }

  const result = await prisma.$transaction(async (tx) => {
    // Update request status
    const updated = await tx.phaseChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      },
      include: {
        project: { select: { name: true } },
        requestedBy: { select: { displayName: true, email: true } },
        reviewedBy: { select: { displayName: true, email: true } },
      },
    })

    // Apply the phase change
    await tx.project.update({
      where: { id: projectId },
      data: { phase: request.requestedPhase },
    })

    // Record in history
    await tx.projectHistory.create({
      data: {
        projectId,
        changedById: reviewerId,
        field: 'phase',
        oldValue: request.currentPhase,
        newValue: request.requestedPhase,
      },
    })

    return updated
  })

  return result
}

export async function rejectPhaseChange(
  projectId: string,
  requestId: string,
  input: PhaseChangeReviewInput,
  reviewerId: string,
  reviewerEmail: string
) {
  // Only admin with designated email can reject
  if (reviewerEmail !== APPROVAL_EMAIL) {
    throw new Error(`Only ${APPROVAL_EMAIL} can reject phase changes`)
  }

  const request = await prisma.phaseChangeRequest.findUniqueOrThrow({
    where: { id: requestId },
  })

  if (request.projectId !== projectId) {
    throw new Error('Phase change request does not belong to this project')
  }
  if (request.status !== 'pending') {
    throw new Error(`Request has already been ${request.status}`)
  }

  return prisma.phaseChangeRequest.update({
    where: { id: requestId },
    data: {
      status: 'rejected',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote ?? null,
    },
    include: {
      project: { select: { name: true } },
      requestedBy: { select: { displayName: true, email: true } },
      reviewedBy: { select: { displayName: true, email: true } },
    },
  })
}

// ============================================================
// DIRECT PHASE CHANGE (admin only, bypasses request workflow)
// ============================================================

export async function directPhaseChange(
  projectId: string,
  input: DirectPhaseChangeInput,
  adminId: string,
  adminEmail: string
) {
  if (adminEmail !== APPROVAL_EMAIL) {
    throw new Error(`Only ${APPROVAL_EMAIL} can directly change project phases`)
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  if (project.phase === input.newPhase) {
    throw new Error(`Project is already in the "${input.newPhase}" phase`)
  }

  const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date()
  // Auto-set goLiveDate when transitioning to post_implementation
  const goLiveDate =
    input.newPhase === 'post_implementation'
      ? input.goLiveDate
        ? new Date(input.goLiveDate)
        : effectiveDate
      : input.goLiveDate
        ? new Date(input.goLiveDate)
        : project.goLiveDate

  const result = await prisma.$transaction(async (tx) => {
    // Update project phase + dates
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        phase: input.newPhase,
        phaseEffectiveDate: effectiveDate,
        goLiveDate,
      },
      include: { repos: true, claudePaths: true },
    })

    // Create an auto-approved PhaseChangeRequest for audit trail
    await tx.phaseChangeRequest.create({
      data: {
        projectId,
        requestedById: adminId,
        currentPhase: project.phase,
        requestedPhase: input.newPhase,
        reason: input.reason,
        status: 'approved',
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: 'Direct admin phase change',
      },
    })

    // Record in history
    await tx.projectHistory.create({
      data: {
        projectId,
        changedById: adminId,
        field: 'phase',
        oldValue: project.phase,
        newValue: input.newPhase,
      },
    })

    if (effectiveDate) {
      await tx.projectHistory.create({
        data: {
          projectId,
          changedById: adminId,
          field: 'phaseEffectiveDate',
          oldValue: project.phaseEffectiveDate?.toISOString() ?? null,
          newValue: effectiveDate.toISOString(),
        },
      })
    }

    if (goLiveDate && goLiveDate.toISOString() !== project.goLiveDate?.toISOString()) {
      await tx.projectHistory.create({
        data: {
          projectId,
          changedById: adminId,
          field: 'goLiveDate',
          oldValue: project.goLiveDate?.toISOString() ?? null,
          newValue: goLiveDate.toISOString(),
        },
      })
    }

    return updated
  })

  return result
}

// ============================================================
// ENHANCEMENT PROJECTS
// ============================================================

export async function createEnhancementProject(
  parentId: string,
  input: CreateEnhancementInput,
  developerId: string
) {
  const parent = await prisma.project.findUniqueOrThrow({
    where: { id: parentId },
    include: { repos: true, claudePaths: true },
  })

  if (parent.parentProjectId) {
    throw new Error('Cannot create an enhancement of an enhancement project')
  }

  // Auto-compute enhancement number
  const maxEnhancement = await prisma.project.aggregate({
    where: { parentProjectId: parentId },
    _max: { enhancementNumber: true },
  })
  const enhancementNumber = (maxEnhancement._max.enhancementNumber ?? 0) + 1

  const name = `${parent.name} - ${input.enhancementLabel}`

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name,
        description: input.description ?? `Enhancement of ${parent.name}: ${input.enhancementLabel}`,
        businessJustification: parent.businessJustification,
        phase: 'application_development',
        managementAuthorized: parent.managementAuthorized,
        probableToComplete: true,
        developmentUncertainty: 'low',
        status: 'active',
        monitored: true,
        parentProjectId: parentId,
        enhancementLabel: input.enhancementLabel,
        enhancementNumber,
        phaseEffectiveDate: new Date(),
        createdById: developerId,
        repos: {
          create: parent.repos.map((r) => ({
            repoPath: r.repoPath,
            repoUrl: r.repoUrl,
          })),
        },
        claudePaths: {
          create: parent.claudePaths.map((c) => ({
            claudePath: c.claudePath,
            localPath: c.localPath,
          })),
        },
      },
      include: { repos: true, claudePaths: true },
    })

    // Record creation in history
    await tx.projectHistory.create({
      data: {
        projectId: created.id,
        changedById: developerId,
        field: '_created',
        oldValue: null,
        newValue: `Enhancement #${enhancementNumber} of ${parent.name}`,
      },
    })

    return created
  })

  return project
}

export async function listEnhancementProjects(parentId: string) {
  return prisma.project.findMany({
    where: { parentProjectId: parentId },
    include: { repos: true, claudePaths: true },
    orderBy: { enhancementNumber: 'asc' },
  })
}
