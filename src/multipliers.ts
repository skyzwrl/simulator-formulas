import { isFiniteNumber, saturate } from "./numbers";

/** "add" sums each source's bonus over 1 (x1.5 and x2 make x2.5), "multiply" chains them (x2 and x2 make x4) */
export type Stacking = "add" | "multiply";

export interface BucketConfig {
	readonly name: string;
	readonly stacking?: Stacking;
}

export interface SourceBreakdown {
	readonly id: string;
	readonly value: number;
	readonly expiresAt: number;
}

export interface BucketBreakdown {
	readonly name: string;
	readonly factor: number;
	readonly sources: ReadonlyArray<SourceBreakdown>;
}

export interface Breakdown {
	readonly total: number;
	readonly buckets: ReadonlyArray<BucketBreakdown>;
}

interface Source {
	readonly value: number;
	readonly expiresAt: number;
}

interface Bucket {
	readonly name: string;
	readonly stacking: Stacking;
	readonly sources: Map<string, Source>;
}

function checkValue(value: number): number {
	if (!isFiniteNumber(value) || value < 0) {
		throw `multiplier values must be finite and non-negative, got ${value}`;
	}
	return value;
}

export class MultiplierStack {
	private readonly buckets = new Array<Bucket>();
	private readonly bucketsByName = new Map<string, Bucket>();
	private cachedTotal = 1;
	private cacheValidUntil = -math.huge;
	private earliestExpiry = math.huge;

	public constructor(buckets: ReadonlyArray<string | BucketConfig>) {
		for (const entry of buckets) {
			const config: BucketConfig = typeIs(entry, "string") ? { name: entry } : entry;
			if (this.bucketsByName.has(config.name)) {
				throw `duplicate multiplier bucket "${config.name}"`;
			}
			const bucket: Bucket = { name: config.name, stacking: config.stacking ?? "add", sources: new Map() };
			this.buckets.push(bucket);
			this.bucketsByName.set(config.name, bucket);
		}
	}

	public set(bucket: string, id: string, value: number): void {
		this.getBucket(bucket).sources.set(id, { value: checkValue(value), expiresAt: math.huge });
		this.cacheValidUntil = -math.huge;
	}

	/** reusing an active boost's id with the same value adds to its time left, a different value replaces it */
	public boost(bucket: string, id: string, value: number, duration: number, now: number): number {
		checkValue(value);
		if (!isFiniteNumber(duration) || duration <= 0) {
			throw `boost duration must be positive, got ${duration}`;
		}

		const sources = this.getBucket(bucket).sources;
		const existing = sources.get(id);
		const stacks = existing !== undefined && existing.expiresAt > now && existing.value === value;
		const expiresAt = stacks ? existing.expiresAt + duration : now + duration;

		sources.set(id, { value, expiresAt });
		this.cacheValidUntil = -math.huge;
		return expiresAt;
	}

	public remove(bucket: string, id: string): boolean {
		const sources = this.getBucket(bucket).sources;
		if (!sources.has(id)) {
			return false;
		}
		sources.delete(id);
		this.cacheValidUntil = -math.huge;
		return true;
	}

	public timeLeft(bucket: string, id: string, now: number): number {
		const source = this.getBucket(bucket).sources.get(id);
		if (source === undefined || source.expiresAt <= now) {
			return 0;
		}
		return source.expiresAt - now;
	}

	public total(now: number): number {
		// the product only changes when a source is touched or the next boost runs out
		if (now < this.cacheValidUntil) {
			return this.cachedTotal;
		}

		this.earliestExpiry = math.huge;
		let total = 1;
		for (const bucket of this.buckets) {
			total *= this.evaluate(bucket, now);
		}

		this.cachedTotal = saturate(total);
		this.cacheValidUntil = this.earliestExpiry;
		return this.cachedTotal;
	}

	public breakdown(now: number): Breakdown {
		const buckets = new Array<BucketBreakdown>();
		for (const bucket of this.buckets) {
			const factor = this.evaluate(bucket, now);
			const sources = new Array<SourceBreakdown>();
			for (const [id, source] of bucket.sources) {
				sources.push({ id, value: source.value, expiresAt: source.expiresAt });
			}
			sources.sort((a, b) => a.id < b.id);
			buckets.push({ name: bucket.name, factor, sources });
		}
		return { total: this.total(now), buckets };
	}

	private evaluate(bucket: Bucket, now: number): number {
		let factor = 1;
		for (const [id, source] of bucket.sources) {
			if (source.expiresAt <= now) {
				bucket.sources.delete(id);
				continue;
			}
			this.earliestExpiry = math.min(this.earliestExpiry, source.expiresAt);
			factor = bucket.stacking === "add" ? factor + source.value - 1 : factor * source.value;
		}
		// enough penalties in an additive bucket would otherwise flip the total negative
		return math.max(0, factor);
	}

	private getBucket(name: string): Bucket {
		const bucket = this.bucketsByName.get(name);
		if (bucket === undefined) {
			throw `unknown multiplier bucket "${name}"`;
		}
		return bucket;
	}
}
