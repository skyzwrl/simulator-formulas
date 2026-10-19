/// <reference types="@rbxts/testez/globals" />

import { capped, CostCurve, costTable, exponential, linear, piecewise, polynomial, quote } from "..";

function seeded(seed: number) {
	let state = seed;
	return (min: number, max: number) => {
		state = (state * 16807) % 2147483647;
		return min + (state % (max - min + 1));
	};
}

function loopSum(curve: CostCurve, level: number, amount: number): number {
	let total = 0;
	for (let index = 0; index < amount; index++) {
		total += curve.cost(level + index);
	}
	return total;
}

function buyOneAtATime(curve: CostCurve, level: number, budget: number): number {
	let bought = 0;
	let spent = 0;
	while (spent + curve.cost(level + bought) <= budget) {
		spent += curve.cost(level + bought);
		bought += 1;
	}
	return bought;
}

function expectClose(actual: number, expected: number, tolerance = 1e-9) {
	const scale = math.max(1, math.abs(expected));
	if (math.abs(actual - expected) > tolerance * scale) {
		throw `expected ${actual} to be within ${tolerance * 100}% of ${expected}`;
	}
}

function expectExactBoundaries(curve: CostCurve, levels: ReadonlyArray<number>, amounts: ReadonlyArray<number>) {
	for (const level of levels) {
		for (const amount of amounts) {
			const exact = curve.bulkCost(level, amount);
			const atBoundary = curve.maxAffordable(level, exact);
			if (atBoundary !== amount) {
				throw `level ${level}: a budget of exactly ${exact} bought ${atBoundary} levels, expected ${amount}`;
			}

			const short = exact - curve.cost(level + amount - 1) * 1e-6;
			const belowBoundary = curve.maxAffordable(level, short);
			if (belowBoundary !== amount - 1) {
				throw `level ${level}: just under ${exact} bought ${belowBoundary} levels, expected ${amount - 1}`;
			}
		}
	}
}

export = () => {
	describe("exponential", () => {
		const curve = exponential(10, 1.15);

		it("prices a level as base * growth ^ level", () => {
			expect(curve.cost(0)).to.equal(10);
			expectClose(curve.cost(3), 10 * 1.15 ** 3);
		});

		it("matches a loop sum for bulk purchases", () => {
			const random = seeded(7);
			for (let run = 0; run < 50; run++) {
				const level = random(0, 200);
				const amount = random(1, 100);
				expectClose(curve.bulkCost(level, amount), loopSum(curve, level, amount));
			}
			expect(curve.bulkCost(5, 0)).to.equal(0);
		});

		it("buys exactly the levels a budget covers at the boundary", () => {
			expectExactBoundaries(curve, [0, 1, 17, 150], [1, 2, 10, 64]);
		});

		it("agrees with buying one level at a time", () => {
			const random = seeded(11);
			for (let run = 0; run < 100; run++) {
				const level = random(0, 100);
				const budget = random(1, 1e9) + random(0, 99) / 100;
				expect(curve.maxAffordable(level, budget)).to.equal(buyOneAtATime(curve, level, budget));
			}
		});

		it("affords nothing when the next level is out of reach", () => {
			expect(curve.maxAffordable(0, 9.99)).to.equal(0);
			expect(curve.maxAffordable(0, -50)).to.equal(0);
			expect(curve.maxAffordable(0, 0 / 0)).to.equal(0);
		});

		it("treats a growth of 1 as a flat price", () => {
			const flat = exponential(5, 1);
			expect(flat.bulkCost(10, 4)).to.equal(20);
			expect(flat.maxAffordable(0, 19)).to.equal(3);
			expect(flat.maxAffordable(0, 20)).to.equal(4);
		});

		it("returns quickly once the answer is past double precision", () => {
			expect(exponential(1, 1).maxAffordable(0, 1e300)).to.equal(1e300);
			expect(curve.maxAffordable(0, math.huge)).to.equal(math.huge);
		});

		it("affords nothing once costs overflow", () => {
			expect(curve.cost(10_000)).to.equal(math.huge);
			expect(curve.maxAffordable(10_000, 1e308)).to.equal(0);
		});

		it("rejects bad parameters", () => {
			expect(() => exponential(0, 1.1)).to.throw("positive base");
			expect(() => exponential(10, 0.9)).to.throw("growth >= 1");
			expect(() => exponential(10, 0 / 0)).to.throw("growth >= 1");
		});
	});

	describe("polynomial", () => {
		const shapes = [[5], [5, 2], [5, 2, 0.5], [5, 2, 0.5, 0.01]];

		it("matches loop sums for every degree", () => {
			const random = seeded(3);
			for (const coefficients of shapes) {
				const curve = polynomial(coefficients);
				for (let run = 0; run < 25; run++) {
					const level = random(0, 500);
					const amount = random(1, 200);
					expectClose(curve.bulkCost(level, amount), loopSum(curve, level, amount));
				}
			}
		});

		it("stays accurate at very high levels", () => {
			const curve = polynomial([5, 2, 0.5, 0.01]);
			expectClose(curve.bulkCost(1e6, 3), loopSum(curve, 1e6, 3), 1e-12);
		});

		it("buys exactly the levels a budget covers at the boundary", () => {
			for (const coefficients of shapes) {
				expectExactBoundaries(polynomial(coefficients), [0, 9, 300], [1, 3, 50, 777]);
			}
		});

		it("agrees with buying one level at a time", () => {
			const random = seeded(19);
			const curve = polynomial([25, 4, 1]);
			for (let run = 0; run < 100; run++) {
				const level = random(0, 50);
				const budget = random(1, 5e6) + random(0, 99) / 100;
				expect(curve.maxAffordable(level, budget)).to.equal(buyOneAtATime(curve, level, budget));
			}
		});

		it("builds linear curves as first degree polynomials", () => {
			const curve = linear(10, 5);
			expect(curve.cost(0)).to.equal(10);
			expect(curve.cost(4)).to.equal(30);
			expect(curve.bulkCost(0, 4)).to.equal(70);
			expect(curve.maxAffordable(0, 69)).to.equal(3);
		});

		it("buys unlimited levels with an infinite budget", () => {
			expect(linear(10, 5).maxAffordable(0, math.huge)).to.equal(math.huge);
		});

		it("rejects bad coefficients", () => {
			expect(() => polynomial([])).to.throw("1 to 4 coefficients");
			expect(() => polynomial([1, 2, 3, 4, 5])).to.throw("1 to 4 coefficients");
			expect(() => polynomial([0, 1])).to.throw("positive constant term");
			expect(() => polynomial([1, -1])).to.throw("non-negative");
			expect(() => polynomial([1, 0 / 0])).to.throw("non-negative");
		});
	});

	describe("piecewise", () => {
		const curve = piecewise([
			{ levels: 10, curve: exponential(10, 1.1) },
			{ levels: 5, curve: linear(100, 20) },
			{ curve: exponential(500, 1.3) },
		]);

		it("prices each level from its own segment", () => {
			expect(curve.cost(0)).to.equal(10);
			expectClose(curve.cost(9), 10 * 1.1 ** 9);
			expect(curve.cost(10)).to.equal(100);
			expect(curve.cost(14)).to.equal(180);
			expect(curve.cost(15)).to.equal(500);
			expectClose(curve.cost(16), 650);
		});

		it("sums bulk purchases across segment boundaries", () => {
			const random = seeded(23);
			for (let run = 0; run < 60; run++) {
				const level = random(0, 30);
				const amount = random(1, 30);
				expectClose(curve.bulkCost(level, amount), loopSum(curve, level, amount));
			}
		});

		it("buys exactly the levels a budget covers at the boundary", () => {
			expectExactBoundaries(curve, [0, 8, 10, 14, 15, 40], [1, 2, 5, 12, 20]);
		});

		it("agrees with buying one level at a time", () => {
			const random = seeded(29);
			for (let run = 0; run < 100; run++) {
				const level = random(0, 25);
				const budget = random(1, 2e6) + random(0, 99) / 100;
				expect(curve.maxAffordable(level, budget)).to.equal(buyOneAtATime(curve, level, budget));
			}
		});

		it("rejects bad segments", () => {
			expect(() => piecewise([])).to.throw("at least one segment");
			expect(() => piecewise([{ curve: linear(1, 1) }, { levels: 5, curve: linear(1, 1) }])).to.throw(
				"only the last segment",
			);
			expect(() => piecewise([{ levels: 0, curve: linear(1, 1) }])).to.throw("positive whole number");
			expect(() => piecewise([{ levels: 2.5, curve: linear(1, 1) }])).to.throw("positive whole number");
		});
	});

	describe("capped", () => {
		const curve = capped(exponential(10, 2), 5);

		it("stops selling levels at the cap", () => {
			expect(curve.bulkCost(0, 5)).to.equal(310);
			expect(curve.cost(5)).to.equal(math.huge);
			expect(curve.bulkCost(4, 2)).to.equal(math.huge);
			expect(curve.maxAffordable(3, 1e9)).to.equal(2);
			expect(curve.maxAffordable(5, 1e9)).to.equal(0);
		});

		it("caps an infinite budget too", () => {
			expect(curve.maxAffordable(0, math.huge)).to.equal(5);
		});

		it("rejects a max level below 1", () => {
			expect(() => capped(linear(1, 1), 0)).to.throw("max level");
			expect(() => capped(linear(1, 1), 1.5)).to.throw("max level");
		});
	});

	describe("quote and costTable", () => {
		const curve = exponential(10, 2);

		it("quotes as many of the requested levels as the budget covers", () => {
			const all = quote(curve, 0, 1e9, 10);
			expect(all.amount).to.equal(10);
			expect(all.cost).to.equal(curve.bulkCost(0, 10));

			const some = quote(curve, 0, 75, 10);
			expect(some.amount).to.equal(3);
			expect(some.cost).to.equal(70);

			const max = quote(curve, 2, 300);
			expect(max.amount).to.equal(curve.maxAffordable(2, 300));
		});

		it("lists the cost of each level in a range", () => {
			expect(costTable(curve, 0, 4).join(",")).to.equal("10,20,40,80");
			expect(costTable(curve, 3, 3).size()).to.equal(0);
		});
	});
};
