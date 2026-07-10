const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const cleanValue = (value: unknown, path: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const entryPath = `${path}[${index}]`
      if (entry === undefined) throw new Error(`Firestore array contains undefined at ${entryPath}`)
      return cleanValue(entry, entryPath)
    })
  }
  if (!isPlainObject(value)) return value

  const cleaned: Record<string, unknown> = {}
  Object.entries(value).forEach(([key, entry]) => {
    if (entry === undefined) return
    const entryPath = path ? `${path}.${key}` : key
    cleaned[key] = cleanValue(entry, entryPath)
  })
  return cleaned
}

export function toFirestoreData<T>(value: T): T {
  if (value === undefined) throw new Error('Firestore document cannot be undefined')
  return cleanValue(value, '') as T
}
