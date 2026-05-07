interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: 'default' | 'danger' | 'warning' | 'purple' | 'green'
}

const accentMap = {
  default: 'text-gray-900',
  danger: 'text-red-700',
  warning: 'text-amber-700',
  purple: 'text-purple-700',
  green: 'text-green-700',
}

export default function MetricCard({
  label,
  value,
  sub,
  accent = 'default',
}: Props) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
      <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-semibold leading-tight ${accentMap[accent]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
