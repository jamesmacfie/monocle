interface Props {
  name: string | string[]
  className?: string
}

export function CommandName({ name, className }: Props) {
  if (Array.isArray(name)) {
    const fullTitle = `${name[0]} > ${name[1]}`
    return (
      <span className={className} title={fullTitle}>
        {name[0]}
        <span className="command-item-seperator">&gt;</span>
        <span className="command-item-parent">{name[1]}</span>
      </span>
    )
  }

  return (
    <span className={className} title={name}>
      {name}
    </span>
  )
}

// Utility function to get the display name from a command name
export function getDisplayName(name: string | string[]): string {
  return Array.isArray(name) ? name[0] : name
}
