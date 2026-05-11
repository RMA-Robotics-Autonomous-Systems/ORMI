export interface Unsubscribable {
	unsubscribe(): void;
}

export interface RefCountedSubscriptionEntry<
	TSubscriber extends Unsubscribable,
	TMetadata,
> {
	subscriber: TSubscriber;
	count: number;
	metadata: TMetadata;
}

export interface RefCountedSubscriptionCreateResult<
	TSubscriber extends Unsubscribable,
	TMetadata,
> {
	subscriber: TSubscriber;
	metadata: TMetadata;
}

export class RefCountedSubscriptionRegistry<
	TSubscriber extends Unsubscribable,
	TMetadata = undefined,
> {
	private readonly subscriptions = new Map<
		string,
		RefCountedSubscriptionEntry<TSubscriber, TMetadata>
	>();

	subscribe(
		topicName: string,
		create: () => RefCountedSubscriptionCreateResult<
			TSubscriber,
			TMetadata
		>,
	): {
		entry: RefCountedSubscriptionEntry<TSubscriber, TMetadata>;
		created: boolean;
	} {
		const existing = this.subscriptions.get(topicName);
		if (existing) {
			existing.count += 1;
			return { entry: existing, created: false };
		}

		const { subscriber, metadata } = create();
		const entry: RefCountedSubscriptionEntry<TSubscriber, TMetadata> = {
			subscriber,
			count: 1,
			metadata,
		};
		this.subscriptions.set(topicName, entry);
		return { entry, created: true };
	}

	unsubscribe(topicName: string, ignoreCount = false): boolean {
		const entry = this.subscriptions.get(topicName);
		if (!entry) return false;

		if (ignoreCount) {
			entry.count = 0;
		} else {
			entry.count -= 1;
		}

		if (entry.count <= 0) {
			try {
				entry.subscriber.unsubscribe();
			} catch {
				// ignore teardown errors during cleanup/unsubscribe
			}
			this.subscriptions.delete(topicName);
		}

		return true;
	}

	replaceSubscriber(topicName: string, subscriber: TSubscriber): boolean {
		const entry = this.subscriptions.get(topicName);
		if (!entry) return false;
		entry.subscriber = subscriber;
		return true;
	}

	get(
		topicName: string,
	): RefCountedSubscriptionEntry<TSubscriber, TMetadata> | undefined {
		return this.subscriptions.get(topicName);
	}

	entries(): IterableIterator<
		[string, RefCountedSubscriptionEntry<TSubscriber, TMetadata>]
	> {
		return this.subscriptions.entries();
	}

	cleanup(): void {
		for (const entry of this.subscriptions.values()) {
			try {
				entry.subscriber.unsubscribe();
			} catch {
				// ignore teardown errors during cleanup
			}
		}
		this.subscriptions.clear();
	}

	get activeCount(): number {
		return this.subscriptions.size;
	}

	refCountFor(topicName: string): number {
		return this.subscriptions.get(topicName)?.count ?? 0;
	}

	clear(): void {
		this.subscriptions.clear();
	}
}
