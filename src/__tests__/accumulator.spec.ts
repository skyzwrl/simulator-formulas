/// <reference types="@rbxts/testez/globals" />

import { IncomeAccumulator } from "..";

export = () => {
	describe("IncomeAccumulator", () => {
		it("pays out a whole unit once ten tenths have arrived", () => {
			const accumulator = new IncomeAccumulator();
			for (let tick = 1; tick <= 9; tick++) {
				expect(accumulator.add(0.1)).to.equal(0);
			}
			expect(accumulator.add(0.1)).to.equal(1);
			expect(accumulator.getPending()).to.be.near(0, 1e-12);
		});

		it("carries fractions across frames", () => {
			const accumulator = new IncomeAccumulator();
			let paid = 0;
			for (let frame = 1; frame <= 59; frame++) {
				paid += accumulator.tick(1, 1 / 60);
			}
			expect(paid).to.equal(0);
			expect(accumulator.tick(1, 1 / 60)).to.equal(1);
		});

		it("loses nothing over a long session", () => {
			const accumulator = new IncomeAccumulator();
			let paid = 0;
			for (let frame = 0; frame < 100_000; frame++) {
				paid += accumulator.tick(7.3, 1 / 60);
			}
			const expected = (7.3 * 100_000) / 60;
			expect(paid).to.equal(math.floor(expected));
			expect(paid + accumulator.getPending()).to.be.near(expected, 1e-6);
		});

		it("pays out in multiples of its unit", () => {
			const accumulator = new IncomeAccumulator(0.01);
			expect(accumulator.add(0.004)).to.equal(0);
			expect(accumulator.add(0.004)).to.equal(0);
			expect(accumulator.add(0.004)).to.be.near(0.01, 1e-12);
			expect(accumulator.getPending()).to.be.near(0.002, 1e-12);
		});

		it("passes large amounts straight through", () => {
			const accumulator = new IncomeAccumulator();
			expect(accumulator.add(1e20)).to.equal(1e20);
			expect(accumulator.getPending()).to.equal(0);
		});

		it("ignores income that isn't a positive finite number", () => {
			const accumulator = new IncomeAccumulator();
			accumulator.add(0.5);
			expect(accumulator.add(0 / 0)).to.equal(0);
			expect(accumulator.add(math.huge)).to.equal(0);
			expect(accumulator.add(-5)).to.equal(0);
			expect(accumulator.getPending()).to.equal(0.5);
		});

		it("clears pending income on reset", () => {
			const accumulator = new IncomeAccumulator();
			accumulator.add(0.75);
			accumulator.reset();
			expect(accumulator.getPending()).to.equal(0);
		});

		it("rejects units that aren't positive", () => {
			expect(() => new IncomeAccumulator(0)).to.throw("unit must be positive");
		});
	});
};
