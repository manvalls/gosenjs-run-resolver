import { Command } from '@gosen/command-types'

const inflightFetches = new Map<string, Promise<Response>>()

const dedupedFetch = (url: string) => {
  if (inflightFetches.has(url)) {
    return inflightFetches.get(url)
  }

  const promise = fetch(url, { credentials: 'omit' })
  inflightFetches.set(url, promise)
  promise.then(() => inflightFetches.delete(url))
  return promise
}

export const resolve = async (commands: Command[], cache: Record<string, Command[]> = {}): Promise<Command[]> => {

  await Promise.all(commands.map(async (command) => {
    if (!('run' in command) || cache[command.run]) {
      return
    }

    const res = await dedupedFetch(command.run)
    const commands = await res.json()

    if (!Array.isArray(commands)) {
      cache[command.run] = []
      return
    }

    cache[command.run] = await resolve(commands, cache)
  }))

  let nextRoutineId = commands.reduce((acc, command) => {
    return Math.max(acc, command.routine || 0)
  }, 0) + 1

  const result: Command[] = []

  for (const command of commands) {
    if ('run' in command) {
      const routineIdMap: Record<number, number> = {}

      result.push(...cache[command.run].map((rc) => {
        if (rc.routine) {
          if (!routineIdMap[rc.routine]) {
            routineIdMap[rc.routine] = nextRoutineId++
          }

          return {
            ...rc,
            routine: routineIdMap[rc.routine],
          }
        }

        if (command.routine) {
          return {
            ...rc,
            routine: command.routine,
          }
        }

        return rc
      }))

      continue
    }

    result.push(command)
  }

  return result
}
