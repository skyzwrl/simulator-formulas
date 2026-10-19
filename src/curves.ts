import { isFiniteNumber, MAX_EXACT_INTEGER } from "./numbers";

export interface CostCurve {
	/** cost of going from `level` to `level + 1` */
	cost(level: number): number;
	bulkCost(level: number, amount: number): number;
	maxAffordable(level: number, budget: number): number;
}

export interface Segment {
	/** levels covered by this segment, omitted on an open-ended last segment */
	readonly levels?: number;
	/** priced with levels counted from the start of the segment */
	readonly curve: CostCurve;
}

export interface Quote {
	readonly amount: number;
	readonly cost: number;
}

function fits(cost: number, budget: number): boolean {
	return cost <= budget && cost < math.huge;
}

abstract class Curve implements CostCurve {
	public abstract cost(level: number): number;
	public abstract bulkCost(level: number, amount: number): number;
	protected abstract estimate(level: number, budget: number): number;

	public maxAffordable(level: number, budget: number): number {
		if (!fits(this.cost(level), budget)) {
			return 0;
		}

		// closed forms can land a level off when the budget sits right on a boundary, so the estimate
		// is nudged until bulkCost(amount) <= budget < bulkCost(amount + 1) holds for this curve
		let amount = math.max(0, this.estimate(level, budget));
		if (amount >= MAX_EXACT_INTEGER) {
			return amount;
		}
		while (amount > 0 && !fits(this.bulkCost(level, amount), budget)) {
			amount -= 1;
		}
		while (fits(this.bulkCost(level, amount + 1), budget)) {
			amount += 1;
		}
		return amount;
	}
}

class ExponentialCurve extends Curve {
	public constructor(
		private readonly base: number,
		private readonly growth: number,
	) {
		super();
	}

	public cost(level: number): number {
		return this.base * this.growth ** level;
	}

	public bulkCost(level: number, amount: number): number {
		if (amount <= 0) {
			return 0;
		}
		if (this.growth === 1) {
			return this.base * amount;
		}
		return (this.cost(level) * (this.growth ** amount - 1)) / (this.growth - 1);
	}

	protected estimate(level: number, budget: number): number {
		if (this.growth === 1) {
			return math.floor(budget / this.base);
		}
		// inverse of the geometric series sum
		const ratio = 1 + (budget * (this.growth - 1)) / this.cost(level);
		return math.floor(math.log(ratio) / math.log(this.growth));
	}
}

class PolynomialCurve extends Curve {
	public constructor(
		private readonly c0: number,
		private readonly c1: number,
		private readonly c2: number,
		private readonly c3: number,
	) {
		super();
	}

	public cost(level: number): number {
		return this.c0 + level * (this.c1 + level * (this.c2 + level * this.c3));
	}

	public bulkCost(level: number, amount: number): number {
		if (amount <= 0) {
			return 0;
		}

		// shifting the polynomial to start at `level` keeps every power sum in terms of `amount`,
		// instead of subtracting two huge Faulhaber sums when the level is high
		const { c1, c2, c3 } = this;
		const d1 = c1 + level * (2 * c2 + 3 * c3 * level);
		const d2 = c2 + 3 * c3 * level;

		const n = amount;
		const sum1 = (n * (n - 1)) / 2;
		const sum2 = ((n - 1) * n * (2 * n - 1)) / 6;
		return this.cost(level) * n + d1 * sum1 + d2 * sum2 + c3 * sum1 * sum1;
	}

	protected estimate(level: number, budget: number): number {
		let low = 1;
		let high = 2;
		while (fits(this.bulkCost(level, high), budget)) {
			low = high;
			high *= 2;
			if (high > MAX_EXACT_INTEGER) {
				return budget === math.huge ? math.huge : low;
			}
		}
		while (high - low > 1) {
			const middle = math.floor((low + high) / 2);
			if (fits(this.bulkCost(level, middle), budget)) {
				low = middle;
			} else {
				high = middle;
			}
		}
		return low;
	}
}

class PiecewiseCurve extends Curve {
	private readonly starts: number[] = [];
	private readonly lengths: number[] = [];

	public constructor(
		private readonly curves: ReadonlyArray<CostCurve>,
		lengths: ReadonlyArray<number>,
	) {
		super();
		let start = 0;
		for (const length of lengths) {
			this.starts.push(start);
			this.lengths.push(length);
			start += length;
		}
	}

	public cost(level: number): number {
		const index = this.segmentAt(level);
		if (index === undefined) {
			return math.huge;
		}
		return this.curves[index].cost(level - this.starts[index]);
	}

	public bulkCost(level: number, amount: number): number {
		let index = this.segmentAt(level);
		if (index === undefined) {
			return amount > 0 ? math.huge : 0;
		}

		let offset = level - this.starts[index];
		let remaining = amount;
		let total = 0;
		while (remaining > 0) {
			if (index >= this.curves.size()) {
				return math.huge;
			}
			const take = math.min(remaining, this.lengths[index] - offset);
			total += this.curves[index].bulkCost(offset, take);
			remaining -= take;
			index += 1;
			offset = 0;
		}
		return total;
	}

	protected estimate(level: number, budget: number): number {
		let index = this.segmentAt(level);
		if (index === undefined) {
			return 0;
		}

		let offset = level - this.starts[index];
		let remaining = budget;
		let amount = 0;
		while (index < this.curves.size()) {
			const available = this.lengths[index] - offset;
			const finish = available === math.huge ? math.huge : this.curves[index].bulkCost(offset, available);
			if (!fits(finish, remaining)) {
				return amount + math.min(available, this.curves[index].maxAffordable(offset, remaining));
			}
			amount += available;
			remaining -= finish;
			index += 1;
			offset = 0;
		}
		return amount;
	}

	private segmentAt(level: number): number | undefined {
		for (let index = 0; index < this.curves.size(); index++) {
			if (level < this.starts[index] + this.lengths[index]) {
				return index;
			}
		}
		return undefined;
	}
}

export function exponential(base: number, growth: number): CostCurve {
	if (!isFiniteNumber(base) || base <= 0) {
		throw `exponential curve needs a positive base, got ${base}`;
	}
	if (!isFiniteNumber(growth) || growth < 1) {
		throw `exponential curve needs growth >= 1, got ${growth}`;
	}
	return new ExponentialCurve(base, growth);
}

/** coefficients are constant first: [c0, c1, c2, c3] prices level L at c0 + c1*L + c2*L^2 + c3*L^3 */
export function polynomial(coefficients: ReadonlyArray<number>): CostCurve {
	const count = coefficients.size();
	if (count < 1 || count > 4) {
		throw `polynomial curve takes 1 to 4 coefficients, got ${count}`;
	}
	for (const coefficient of coefficients) {
		if (!isFiniteNumber(coefficient) || coefficient < 0) {
			throw `polynomial coefficients must be finite and non-negative, got ${coefficient}`;
		}
	}
	if (coefficients[0] <= 0) {
		throw "polynomial curve needs a positive constant term so every level costs something";
	}
	return new PolynomialCurve(coefficients[0], coefficients[1] ?? 0, coefficients[2] ?? 0, coefficients[3] ?? 0);
}

export function linear(base: number, step: number): CostCurve {
	return polynomial([base, step]);
}

export function piecewise(segments: ReadonlyArray<Segment>): CostCurve {
	const count = segments.size();
	if (count === 0) {
		throw "piecewise curve needs at least one segment";
	}

	const curves = new Array<CostCurve>();
	const lengths = new Array<number>();
	for (let index = 0; index < count; index++) {
		const segment = segments[index];
		const levels = segment.levels;
		if (levels === undefined) {
			if (index < count - 1) {
				throw `only the last segment can be open-ended, segment ${index + 1} has no level count`;
			}
			lengths.push(math.huge);
		} else if (levels < 1 || levels % 1 !== 0) {
			throw `segment ${index + 1} needs a positive whole number of levels, got ${levels}`;
		} else {
			lengths.push(levels);
		}
		curves.push(segment.curve);
	}
	return new PiecewiseCurve(curves, lengths);
}

export function capped(curve: CostCurve, maxLevel: number): CostCurve {
	if (!(maxLevel >= 1) || maxLevel % 1 !== 0) {
		throw `max level must be a whole number of at least 1, got ${maxLevel}`;
	}
	return piecewise([{ levels: maxLevel, curve }]);
}

export function costTable(curve: CostCurve, from: number, to: number): number[] {
	const costs = new Array<number>();
	for (let level = from; level < to; level++) {
		costs.push(curve.cost(level));
	}
	return costs;
}

/** how many of the next `limit` levels the budget covers, and what they cost together */
export function quote(curve: CostCurve, level: number, budget: number, limit = math.huge): Quote {
	const amount = math.min(limit, curve.maxAffordable(level, budget));
	return { amount, cost: curve.bulkCost(level, amount) };
}
