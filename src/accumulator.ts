import { isFiniteNumber } from "./numbers";

// how close the pending amount has to get to the next whole unit to count as reaching it.
// adding 0.1 ten times sums to 0.9999999999999999, which would otherwise pay out a tick late
const SNAP = 1e-9;

export class IncomeAccumulator {
	private pending = 0;

	public constructor(private readonly unit = 1) {
		if (!isFiniteNumber(unit) || unit <= 0) {
			throw `accumulator unit must be positive, got ${unit}`;
		}
	}

	/** banks `amount` and returns the whole units that are ready to pay out, keeping the fraction */
	public add(amount: number): number {
		// one bad multiplier upstream shouldn't be able to turn a balance into nan or inf
		if (!isFiniteNumber(amount) || amount <= 0) {
			return 0;
		}

		this.pending += amount;
		const whole = math.floor(this.pending / this.unit + SNAP) * this.unit;
		this.pending = math.max(0, this.pending - whole);
		return whole;
	}

	public tick(ratePerSecond: number, deltaTime: number): number {
		return this.add(ratePerSecond * deltaTime);
	}

	public getPending(): number {
		return this.pending;
	}

	public reset(): void {
		this.pending = 0;
	}
}
