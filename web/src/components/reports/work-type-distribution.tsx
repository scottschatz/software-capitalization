'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BarChart3 } from 'lucide-react'

export interface WorkTypeData {
  workType: string
  totalHours: number
  capHours: number
  expHours: number
  entries: number
}

interface WorkTypeDistributionProps {
  data: WorkTypeData[]
}

const workTypeLabels: Record<string, string> = {
  coding: 'Coding',
  debugging: 'Debugging',
  refactoring: 'Refactoring',
  research: 'Research',
  code_review: 'Code Review',
  testing: 'Testing',
  documentation: 'Documentation',
  devops: 'DevOps',
  unclassified: 'Unclassified',
}

function formatWorkType(workType: string): string {
  if (workTypeLabels[workType]) return workTypeLabels[workType]
  // Convert snake_case to Title Case
  return workType
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function WorkTypeDistribution({ data }: WorkTypeDistributionProps) {
  const totalHours = data.reduce((sum, d) => sum + d.totalHours, 0)

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Work Type Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Work Type</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
              <TableHead className="text-right">Capitalizable</TableHead>
              <TableHead className="text-right">Expensed</TableHead>
              <TableHead className="text-right">Entries</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.workType}>
                <TableCell className="font-medium">
                  {formatWorkType(row.workType)}
                </TableCell>
                <TableCell className="text-right">
                  {row.totalHours.toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  {totalHours > 0
                    ? `${((row.totalHours / totalHours) * 100).toFixed(1)}%`
                    : '0%'}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {row.capHours.toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-gray-500">
                  {row.expHours.toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  {row.entries}
                </TableCell>
              </TableRow>
            ))}
            {data.length > 1 && (
              <TableRow className="font-semibold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{totalHours.toFixed(1)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
                <TableCell className="text-right text-green-600">
                  {data.reduce((s, d) => s + d.capHours, 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-gray-500">
                  {data.reduce((s, d) => s + d.expHours, 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  {data.reduce((s, d) => s + d.entries, 0)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
