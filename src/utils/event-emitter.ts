export class TypedEventEmitter<T extends Record<string, unknown[]>> {
	private listeners: Map<keyof T, Map<number, (...args: T[keyof T]) => void>> =
		new Map();
	private nextId = 1;

	on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): number {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Map());
		}

		const id = this.nextId++;
		// biome-ignore lint/style/noNonNullAssertion: Checked above
		this.listeners
			.get(event)!
			.set(id, listener as (...args: T[keyof T]) => void);
		return id;
	}

	off(id: number): void {
		for (const eventListeners of this.listeners.values()) {
			if (eventListeners.has(id)) {
				eventListeners.delete(id);
				return;
			}
		}
	}

	emit<K extends keyof T>(event: K, ...args: T[K]): void {
		const eventListeners = this.listeners.get(event);
		if (eventListeners) {
			for (const listener of eventListeners.values()) {
				listener(...args);
			}
		}
	}
}
