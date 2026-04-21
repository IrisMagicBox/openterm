export class TerminalCommandQueue {
  private queue: Promise<void> = Promise.resolve()

  enqueue<T>(run: () => Promise<T>): Promise<T> {
    const commandPromise = this.queue.then(run)
    this.queue = commandPromise.then(
      () => {},
      () => {}
    )
    return commandPromise
  }
}
