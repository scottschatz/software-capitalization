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

// Role-based approval: admin or manager role required (replaces hardcoded email check)

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

  if (query.developerId) {
    // Show projects where the developer has entries, created the project, or discovered it
    where.OR = [
      ...(where.OR ?? []),
      { dailyEntries: { some: { developerId: query.developerId } } },
      { manualEntries: { some: { developerId: query.developerId } } },
      { createdById: query.developerId },
    ]
  }

  return prisma.project.findMany({
    where,
    include: {
      repos: true,
      claudePaths: true,
      parentProject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
      phaseChangeRequests: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, requestedPhase: true, createdAt: true },
      },
      _count: {
        select: {
          phaseChangeRequests: { where: { status: 'pending' } },
          enhancementProjects: true,
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
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
      status: 'pending',
    },
    include: {
      project: { select: { name: true } },
      requestedBy: { select: { displayName: true, email: true } },
    },
  })

  // TODO: Send approval email to admins/managers (Phase 2.4)

  return request
}

export async function approvePhaseChange(
  projectId: string,
  requestId: string,
  input: PhaseChangeReviewInput,
  reviewerId: string,
  reviewerRole: string
) {
  // Enforce: only admin or manager can approve phase changes
  if (reviewerRole !== 'admin' && reviewerRole !== 'manager') {
    throw new Error('Manager or admin access required to approve phase changes')
  }

  // Conflict-of-interest: approver cannot have entries on the same project
  const hasEntries = await prisma.dailyEntry.count({
    where: { developerId: reviewerId, projectId },
  })
  if (hasEntries > 0) {
    throw new Error('Cannot approve phase change for a project you have entries on (conflict of interest)')
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

    // Apply the phase change + auto-set related fields
    const projectUpdate: Record<string, unknown> = {
      phase: request.requestedPhase,
      phaseEffectiveDate: request.effectiveDate ?? new Date(),
    }
    if (request.requestedPhase === 'application_development') {
      projectUpdate.managementAuthorized = true
      projectUpdate.probableToComplete = true
      projectUpdate.authorizationDate = request.effectiveDate ?? new Date()
    }
    if (request.requestedPhase === 'post_implementation') {
      projectUpdate.goLiveDate = request.effectiveDate ?? new Date()
    }
    await tx.project.update({
      where: { id: projectId },
      data: projectUpdate,
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

    // Cascade phase to all entries (including confirmed) after effective date
    const effectiveDate = request.effectiveDate ?? new Date()
    await cascadePhaseToEntries(tx, projectId, request.requestedPhase, effectiveDate, reviewerId)

    return updated
  })

  return result
}

export async function rejectPhaseChange(
  projectId: string,
  requestId: string,
  input: PhaseChangeReviewInput,
  reviewerId: string,
  reviewerRole: string
) {
  // Only admin or manager can reject phase changes
  if (reviewerRole !== 'admin' && reviewerRole !== 'manager') {
    throw new Error('Manager or admin access required to reject phase changes')
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
  adminRole: string
) {
  if (adminRole !== 'admin' && adminRole !== 'manager') {
    throw new Error('Manager or admin access required to directly change project phases')
  }

  // Conflict-of-interest: admin/manager cannot directly change phase on a project where they have recorded hours
  const hasEntries = await prisma.dailyEntry.count({
    where: { developerId: adminId, projectId },
  })
  if (hasEntries > 0) {
    throw new Error('Cannot directly change phase on a project where you have recorded hours (conflict of interest). Use the standard phase change request workflow.')
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

    // Cascade phase to all entries (including confirmed) after effective date
    await cascadePhaseToEntries(tx, projectId, input.newPhase, effectiveDate, adminId)

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

// ============================================================
// ENTRY RECLASSIFICATION ON POST-IMPLEMENTATION TRANSITION
// ============================================================

/**
 * Cascade a phase change to all entries (daily + manual) after the effective date.
 * - Sets `phaseEffective` on ALL entries (including confirmed) — manager authority
 * - Flags pending/flagged entries for re-review when phase differs from phaseAuto
 * - Creates revision records for confirmed entries
 */
async function cascadePhaseToEntries(
  tx: Prisma.TransactionClient,
  projectId: string,
  newPhase: string,
  effectiveDate: Date,
  changedById: string
) {
  // --- Daily Entries ---

  // 1. Set phaseEffective on ALL daily entries after the effective date
  await tx.dailyEntry.updateMany({
    where: { projectId, date: { gte: effectiveDate } },
    data: { phaseEffective: newPhase },
  })

  // 2. Flag pending/flagged entries that had a different phaseAuto for re-review
  const pendingToFlag = await tx.dailyEntry.findMany({
    where: {
      projectId,
      date: { gte: effectiveDate },
      status: { in: ['pending', 'flagged'] },
      phaseAuto: { not: newPhase },
    },
    select: { id: true, descriptionAuto: true },
  })

  if (pendingToFlag.length > 0) {
    await tx.dailyEntry.updateMany({
      where: { id: { in: pendingToFlag.map((e) => e.id) } },
      data: { phaseAuto: newPhase, status: 'flagged' },
    })

    // Append note for post-impl transitions
    if (newPhase === 'post_implementation') {
      const note = '\n⚠️ Enhancement Suggested: Project moved to post-implementation. This entry contained development work — consider moving to an Enhancement Project or confirm as maintenance.'
      for (const entry of pendingToFlag) {
        if (!entry.descriptionAuto?.includes('Enhancement Suggested')) {
          await tx.dailyEntry.update({
            where: { id: entry.id },
            data: { descriptionAuto: (entry.descriptionAuto ?? '') + note },
          })
        }
      }
    }
  }

  // 3. Create revision records for confirmed/approved entries
  const confirmedEntries = await tx.dailyEntry.findMany({
    where: {
      projectId,
      date: { gte: effectiveDate },
      status: { in: ['confirmed', 'approved'] },
    },
    select: { id: true, developerId: true, phaseConfirmed: true },
  })

  for (const entry of confirmedEntries) {
    const lastRev = await tx.dailyEntryRevision.findFirst({
      where: { entryId: entry.id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    })
    await tx.dailyEntryRevision.create({
      data: {
        entryId: entry.id,
        changedById,
        revision: (lastRev?.revision ?? 0) + 1,
        field: 'phaseEffective',
        oldValue: entry.phaseConfirmed,
        newValue: newPhase,
        reason: `Phase change cascade: project moved to ${newPhase}`,
        authMethod: 'system',
      },
    })
  }

  // --- Manual Entries ---

  await tx.manualEntry.updateMany({
    where: { projectId, date: { gte: effectiveDate } },
    data: { phaseEffective: newPhase },
  })

  // Create revision records for manual entries
  const manualEntries = await tx.manualEntry.findMany({
    where: { projectId, date: { gte: effectiveDate } },
    select: { id: true, developerId: true, phase: true },
  })

  for (const entry of manualEntries) {
    const lastRev = await tx.manualEntryRevision.findFirst({
      where: { entryId: entry.id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    })
    await tx.manualEntryRevision.create({
      data: {
        entryId: entry.id,
        changedById,
        revision: (lastRev?.revision ?? 0) + 1,
        field: 'phaseEffective',
        oldValue: entry.phase,
        newValue: newPhase,
        reason: `Phase change cascade: project moved to ${newPhase}`,
        authMethod: 'system',
      },
    })
  }
}
