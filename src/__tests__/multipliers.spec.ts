/// <reference types="@rbxts/testez/globals" />

import { MAX_VALUE, MultiplierStack } from "..";

function createStack() {
	return new MultiplierStack(["pets", { name: "gamepasses", stacking: "multiply" }, "rebirths", "boosts"]);
}

export = () => {
	describe("MultiplierStack", () => {
		it("starts at x1", () => {
			expect(createStack().total(0)).to.equal(1);
		});

		it("adds bonuses inside an additive bucket", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 1.5);
			stack.set("pets", "cat", 2);
			expect(stack.total(0)).to.equal(2.5);
		});

		it("multiplies inside a multiplicative bucket", () => {
			const stack = createStack();
			stack.set("gamepasses", "x2 coins", 2);
			stack.set("gamepasses", "vip", 2);
			expect(stack.total(0)).to.equal(4);
		});

		it("multiplies across buckets", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 1.5);
			stack.set("pets", "cat", 2);
			stack.set("gamepasses", "x2 coins", 2);
			stack.set("rebirths", "rebirths", 3);
			expect(stack.total(0)).to.equal(15);
		});

		it("replaces a source set again under the same id", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 2);
			stack.set("pets", "dragon", 3);
			expect(stack.total(0)).to.equal(3);
		});

		it("removes sources", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 2);
			expect(stack.total(0)).to.equal(2);
			expect(stack.remove("pets", "dragon")).to.equal(true);
			expect(stack.remove("pets", "dragon")).to.equal(false);
			expect(stack.total(0)).to.equal(1);
		});

		it("drops boosts when they expire", () => {
			const stack = createStack();
			stack.boost("boosts", "x2 luck", 2, 60, 100);
			expect(stack.total(100)).to.equal(2);
			expect(stack.total(159.9)).to.equal(2);
			expect(stack.timeLeft("boosts", "x2 luck", 130)).to.equal(30);
			expect(stack.total(160)).to.equal(1);
			expect(stack.timeLeft("boosts", "x2 luck", 160)).to.equal(0);
		});

		it("stacks time when the same boost is used again", () => {
			const stack = createStack();
			stack.boost("boosts", "x2 luck", 2, 60, 0);
			expect(stack.boost("boosts", "x2 luck", 2, 60, 30)).to.equal(120);
			expect(stack.timeLeft("boosts", "x2 luck", 30)).to.equal(90);
		});

		it("replaces a boost used again with a different value", () => {
			const stack = createStack();
			stack.boost("boosts", "luck", 2, 60, 0);
			expect(stack.boost("boosts", "luck", 3, 10, 30)).to.equal(40);
			expect(stack.total(35)).to.equal(3);
			expect(stack.total(41)).to.equal(1);
		});

		it("restarts an expired boost instead of extending it", () => {
			const stack = createStack();
			stack.boost("boosts", "luck", 2, 10, 0);
			expect(stack.boost("boosts", "luck", 2, 10, 20)).to.equal(30);
		});

		it("never serves a stale total after a change", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 2);
			expect(stack.total(0)).to.equal(2);
			stack.set("rebirths", "rebirths", 4);
			expect(stack.total(0)).to.equal(8);
			stack.boost("boosts", "event", 2, 5, 0);
			expect(stack.total(1)).to.equal(16);
		});

		it("recomputes when each boost in turn runs out", () => {
			const stack = createStack();
			stack.boost("boosts", "short", 2, 10, 0);
			stack.boost("boosts", "long", 3, 30, 0);
			expect(stack.total(5)).to.equal(4);
			expect(stack.total(10)).to.equal(3);
			expect(stack.total(29)).to.equal(3);
			expect(stack.total(30)).to.equal(1);
		});

		it("bottoms out at zero instead of going negative", () => {
			const stack = createStack();
			stack.set("pets", "cursed", 0.2);
			stack.set("pets", "also cursed", 0.2);
			stack.set("rebirths", "rebirths", 3);
			expect(stack.total(0)).to.equal(0);
		});

		it("saturates instead of overflowing to inf", () => {
			const stack = createStack();
			stack.set("gamepasses", "a", 1e200);
			stack.set("gamepasses", "b", 1e200);
			expect(stack.total(0)).to.equal(MAX_VALUE);
		});

		it("breaks the total down per bucket for UI", () => {
			const stack = createStack();
			stack.set("pets", "dragon", 1.5);
			stack.set("pets", "cat", 2);
			stack.set("gamepasses", "x2 coins", 2);
			stack.boost("boosts", "event", 1.25, 60, 0);

			const breakdown = stack.breakdown(10);
			expect(breakdown.buckets.size()).to.equal(4);

			let product = 1;
			for (const bucket of breakdown.buckets) {
				product *= bucket.factor;
			}
			expect(product).to.equal(breakdown.total);
			expect(breakdown.total).to.equal(stack.total(10));

			const pets = breakdown.buckets[0];
			expect(pets.name).to.equal("pets");
			expect(pets.factor).to.equal(2.5);
			expect(pets.sources.map((source) => source.id).join(",")).to.equal("cat,dragon");
			expect(breakdown.buckets[3].sources[0].expiresAt).to.equal(60);
		});

		it("rejects unknown buckets, duplicates and bad values", () => {
			const stack = createStack();
			expect(() => stack.set("nope", "a", 2)).to.throw('unknown multiplier bucket "nope"');
			expect(() => stack.set("pets", "a", -1)).to.throw("non-negative");
			expect(() => stack.set("pets", "a", 0 / 0)).to.throw("non-negative");
			expect(() => stack.boost("boosts", "a", 2, 0, 0)).to.throw("duration must be positive");
			expect(() => new MultiplierStack(["pets", "pets"])).to.throw("duplicate");
		});
	});
};
