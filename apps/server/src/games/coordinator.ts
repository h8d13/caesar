class GameCoordinator {
  private readyGames = new Set<string>();
  private startCallbacks = new Map<string, () => void>();
  private registeredGames = new Set<string>();

  register(game: string) {
    this.registeredGames.add(game);
  }

  requestNextRound(game: string, startFn: () => void) {
    this.readyGames.add(game);
    this.startCallbacks.set(game, startFn);

    if (this.readyGames.size === this.registeredGames.size) {
      // All games are ready — start them all together
      const callbacks = [...this.startCallbacks.values()];
      this.readyGames.clear();
      this.startCallbacks.clear();
      for (const cb of callbacks) {
        cb();
      }
    }
  }
}

const gameCoordinator = new GameCoordinator();

export { gameCoordinator };
