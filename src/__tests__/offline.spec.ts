/// <reference types="@rbxts/testez/globals" />

import { falloffTiers, MAX_VALUE, offlineEarnings } from "..";

const HOUR = 3600;

export = () => {
	describe("offlineEarnings", () => {
		const tiers = falloffTiers(HOUR, 8 * HOUR, 0.25);
		const lastOnline = 1_700_000_000;

		it("pays the full rate inside the first tier", () => {
			const result = offlineEarnings(10, lastOnline, lastOnline + 1800, tiers);
			expect(result.earned).to.equal(18_000);
			expect(result.away).to.equal(1800);
			expect(result.credited).to.equal(1800);
		});

		it("drops to the reduced rate after the threshold", () => {
			const result = offlineEarnings(10, lastOnline, lastOnline + 2 * HOUR, tiers);
			expect(result.earned).to.equal(36_000 + 9_000);
			expect(result.credited).to.equal(2 * HOUR);
		});

		it("stops paying at the cap", () => {
			const result = offlineEarnings(10, lastOnline, lastOnline + 100_000, tiers);
			expect(result.earned).to.equal(36_000 + 25_200 * 10 * 0.25);
			expect(result.credited).to.equal(8 * HOUR);
			expect(result.away).to.equal(100_000);
		});

		it("supports any number of tiers", () => {
			const custom = [
				{ duration: HOUR, efficiency: 1 },
				{ duration: HOUR, efficiency: 0.5 },
				{ duration: HOUR, efficiency: 0.1 },
			];
			const result = offlineEarnings(2, lastOnline, lastOnline + 3 * HOUR, custom);
			expect(result.earned).to.be.near(2 * HOUR * 1.6, 1e-9);
		});

		it("pays nothing when the last save is in the future", () => {
			const result = offlineEarnings(10, lastOnline, lastOnline - 50, tiers);
			expect(result.earned).to.equal(0);
			expect(result.away).to.equal(0);
		});

		it("treats corrupt timestamps as no time away", () => {
			const result = offlineEarnings(10, 0 / 0, lastOnline, tiers);
			expect(result.earned).to.equal(0);
			expect(result.away).to.equal(0);
		});

		it("pays nothing for a zero or invalid rate", () => {
			expect(offlineEarnings(0, lastOnline, lastOnline + HOUR, tiers).earned).to.equal(0);
			expect(offlineEarnings(0 / 0, lastOnline, lastOnline + HOUR, tiers).earned).to.equal(0);
		});

		it("saturates instead of overflowing", () => {
			expect(offlineEarnings(1e305, lastOnline, lastOnline + HOUR, tiers).earned).to.equal(MAX_VALUE);
		});

		it("rejects tiers with negative values", () => {
			expect(() => offlineEarnings(1, 0, 10, [{ duration: 5, efficiency: -1 }])).to.throw("non-negative");
		});
	});

	describe("falloffTiers", () => {
		it("skips the reduced tier when the cap equals the threshold", () => {
			expect(falloffTiers(HOUR, HOUR, 0.5).size()).to.equal(1);
		});

		it("rejects invalid settings", () => {
			expect(() => falloffTiers(0, HOUR, 0.5)).to.throw("fullRateFor");
			expect(() => falloffTiers(2 * HOUR, HOUR, 0.5)).to.throw("fullRateFor");
			expect(() => falloffTiers(HOUR, 2 * HOUR, 1.5)).to.throw("between 0 and 1");
		});
	});
};
