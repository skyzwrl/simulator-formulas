import { CostCurve } from "./curves";
import { MAX_EXACT_INTEGER } from "./numbers";

export type RebirthBonus = (rebirths: number) => number;

export type RebirthPricing = "cumulative" | "highest";

export interface PrestigeCurve {
	pointsFor(lifetimeEarnings: number): number;
	earningsFor(points: number): number;
}

export function linearBonus(perRebirth: number): RebirthBonus {
	return (rebirths) => 1 + perRebirth * rebirths;
}

export function logBonus(scale: number, base = 10): RebirthBonus {
	return (rebirths) => 1 + scale * math.log(1 + rebirths, base);
}

/** exponents below 1 give each rebirth a little less than the one before */
export function powerBonus(scale: number, exponent: number): RebirthBonus {
	return (rebirths) => 1 + scale * rebirths ** exponent;
}

/** "cumulative" charges the sum of the next n requirements, "highest" only checks the last one */
export function rebirthsAvailable(
	requirement: CostCurve,
	rebirths: number,
	currency: number,
	pricing: RebirthPricing = "cumulative",
): number {
	if (pricing === "cumulative") {
		return requirement.maxAffordable(rebirths, currency);
	}

	const reaches = (count: number) => requirement.cost(rebirths + count - 1) <= currency;
	if (!reaches(1)) {
		return 0;
	}

	let low = 1;
	let high = 2;
	while (reaches(high)) {
		low = high;
		high *= 2;
		if (high > MAX_EXACT_INTEGER) {
			return currency === math.huge ? math.huge : low;
		}
	}
	while (high - low > 1) {
		const middle = math.floor((low + high) / 2);
		if (reaches(middle)) {
			low = middle;
		} else {
			high = middle;
		}
	}
	return low;
}

abstract class Prestige implements PrestigeCurve {
	public abstract earningsFor(points: number): number;
	protected abstract estimate(lifetimeEarnings: number): number;

	public pointsFor(lifetimeEarnings: number): number {
		if (!(lifetimeEarnings >= this.earningsFor(1))) {
			return 0;
		}

		// pow and log round a hair under exact boundaries, so settle against earningsFor
		let points = math.max(1, this.estimate(lifetimeEarnings));
		if (points >= MAX_EXACT_INTEGER) {
			return points;
		}
		while (points > 1 && this.earningsFor(points) > lifetimeEarnings) {
			points -= 1;
		}
		while (this.earningsFor(points + 1) <= lifetimeEarnings) {
			points += 1;
		}
		return points;
	}
}

class RootPrestige extends Prestige {
	public constructor(
		private readonly unit: number,
		private readonly root: number,
	) {
		super();
	}

	public earningsFor(points: number): number {
		return points <= 0 ? 0 : this.unit * points ** this.root;
	}

	protected estimate(lifetimeEarnings: number): number {
		return math.floor((lifetimeEarnings / this.unit) ** (1 / this.root));
	}
}

class LogPrestige extends Prestige {
	public constructor(
		private readonly unit: number,
		private readonly base: number,
	) {
		super();
	}

	public earningsFor(points: number): number {
		return points <= 0 ? 0 : this.unit * this.base ** (points - 1);
	}

	protected estimate(lifetimeEarnings: number): number {
		return math.floor(math.log(lifetimeEarnings / this.unit, this.base)) + 1;
	}
}

/** points = floor((lifetime / unit) ^ (1 / root)), so each point costs more lifetime earnings than the last */
export function rootPrestige(unit: number, root = 2): PrestigeCurve {
	if (!(unit > 0) || !(root >= 1)) {
		throw `root prestige needs unit > 0 and root >= 1, got ${unit} and ${root}`;
	}
	return new RootPrestige(unit, root);
}

/** the first point at `unit` lifetime earnings and one more every time they multiply by `base` */
export function logPrestige(unit: number, base = 10): PrestigeCurve {
	if (!(unit > 0) || !(base > 1)) {
		throw `log prestige needs unit > 0 and base > 1, got ${unit} and ${base}`;
	}
	return new LogPrestige(unit, base);
}

export function claimablePoints(curve: PrestigeCurve, lifetimeEarnings: number, claimed: number): number {
	return math.max(0, curve.pointsFor(lifetimeEarnings) - claimed);
}

export function progressToNextPoint(curve: PrestigeCurve, lifetimeEarnings: number): number {
	const points = curve.pointsFor(lifetimeEarnings);
	const from = curve.earningsFor(points);
	const to = curve.earningsFor(points + 1);
	if (!(to > from)) {
		return 0;
	}
	return math.clamp((lifetimeEarnings - from) / (to - from), 0, 1);
}

function deepCopy<T>(value: T): T {
	if (!typeIs(value, "table")) {
		return value;
	}
	const copy = new Map<unknown, unknown>();
	for (const [key, item] of value as unknown as Map<unknown, unknown>) {
		copy.set(key, deepCopy(item));
	}
	return copy as unknown as T;
}

/** what each reset layer wipes is just data, e.g. rebirth: ["coins", "upgrades"], prestige: [..., "rebirths"] */
export function applyReset<S extends object>(state: S, defaults: S, keys: ReadonlyArray<keyof S>): S {
	const result = table.clone(state);
	for (const key of keys) {
		result[key] = deepCopy(defaults[key]);
	}
	return result;
}
