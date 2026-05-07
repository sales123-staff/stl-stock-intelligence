import type { RiskStatus } from '@/types'
import { STATUS_LABELS } from '@/utils/dataProcessing'

const statusStyles: Record<RiskStatus, string> = {
  critico:
    'bg-red-100 text-red-800 border border-red-200',
  vermelho:
    'bg-orange-100 text-orange-800 border border-orange-200',
  amarelo:
    'bg-amber-100 text-amber-800 border border-amber-200',
  verde:
    'bg-green-100 text-green-800 border border-green-200',
  parado:
    'bg-purple-100 text-purple-800 border border-purple-200',
  'sem-dados':
    'bg-gray-100 text-gray-600 border border-gray-200',
}

interface Props {
  status: RiskStatus
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${statusStyles[status]} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
