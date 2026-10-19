/// <reference types="@rbxts/testez/globals" />

import {
	applyReset,
	claimablePoints,
	exponential,
	linearBonus,
	logBonus,
	logPrestige,
	powerBonus,
	progressToNextPoint,
	rebirthsAvailable,
	rootPrestige,
} from "..";

interface PlayerData {
	coins: number;
	gems: number;
	rebirths: number;
	upgrades: { speed: number; luck: number };
	unlockedZones: string[];
}

export = () => {
	describe("rebirth bonuses", () => {
		it("grows linearly", () => {
			const bonus = linearBonus(0.5);
			expect(bonus(0)).to.equal(1);
			expect(bonus(4)).to.equal(3);
		});

		it("grows with the log of the rebirth count", () => {
			const bonus = logBonus(1);
			expect(bonus(0)).to.equal(1);
			expect(bonus(9)).to.be.near(2, 1e-12);
			expect(bonus(99)).to.be.near(3, 1e-12);
		});

		it("gives less per rebirth with an exponent below 1", () => {
			const bonus = powerBonus(1, 0.5);
			expect(bonus(16)).to.equal(5);
			expect(bonus(4) - bonus(3) < bonus(1) - bonus(0)).to.equal(true);
		});
	});

	describe("rebirthsAvailable", () => {
		const requirement = exponential(1000, 2);

		it("charges the sum of the next requirements with cumulative pricing", () => {
			expect(rebirthsAvailable(requirement, 0, 7000)).to.equal(3);
			expect(rebirthsAvailable(requirement, 0, 5000)).to.equal(2);
		});

		it("only checks the last requirement with highest pricing", () => {
			expect(rebirthsAvailable(requirement, 0, 5000, "highest")).to.equal(3);
			expect(rebirthsAvailable(requirement, 0, 3999, "highest")).to.equal(2);
		});

		it("counts from the player's current rebirths", () => {
			expect(rebirthsAvailable(requirement, 3, 20_000)).to.equal(1);
			expect(rebirthsAvailable(requirement, 3, 20_000, "highest")).to.equal(2);
		});

		it("allows none below the next requirement", () => {
			expect(rebirthsAvailable(requirement, 0, 999)).to.equal(0);
			expect(rebirthsAvailable(requirement, 0, 999, "highest")).to.equal(0);
		});

		it("allows unlimited rebirths with infinite currency", () => {
			expect(rebirthsAvailable(requirement, 0, math.huge, "highest")).to.equal(math.huge);
		});
	});

	describe("prestige", () => {
		it("lands exactly on square root boundaries", () => {
			const curve = rootPrestige(1e6);
			expect(curve.pointsFor(0)).to.equal(0);
			expect(curve.pointsFor(999_999)).to.equal(0);
			expect(curve.pointsFor(1e6)).to.equal(1);
			expect(curve.pointsFor(4e6 - 1)).to.equal(1);
			expect(curve.pointsFor(4e6)).to.equal(2);
			for (let points = 1; points <= 2000; points++) {
				expect(curve.pointsFor(1e6 * points * points)).to.equal(points);
			}
		});

		it("lands exactly on cube root boundaries", () => {
			const curve = rootPrestige(1000, 3);
			for (let points = 1; points <= 500; points++) {
				const earnings = 1000 * points ** 3;
				expect(curve.pointsFor(earnings)).to.equal(points);
				expect(curve.pointsFor(earnings - 1)).to.equal(points - 1);
			}
		});

		it("adds a point every time earnings multiply by the base", () => {
			const curve = logPrestige(1e6, 10);
			expect(curve.pointsFor(999)).to.equal(0);
			expect(curve.pointsFor(1e6)).to.equal(1);
			expect(curve.pointsFor(9.99e6)).to.equal(1);
			expect(curve.pointsFor(1e7)).to.equal(2);
			expect(curve.pointsFor(1e9)).to.equal(4);
			expect(curve.earningsFor(3)).to.equal(1e8);
		});

		it("inverts points back into earnings", () => {
			const curve = rootPrestige(100);
			expect(curve.earningsFor(0)).to.equal(0);
			expect(curve.earningsFor(3)).to.equal(900);
		});

		it("only lets players claim what they haven't claimed yet", () => {
			const curve = rootPrestige(100);
			expect(claimablePoints(curve, 900, 1)).to.equal(2);
			expect(claimablePoints(curve, 900, 5)).to.equal(0);
		});

		it("reports progress towards the next point", () => {
			const curve = rootPrestige(100);
			expect(progressToNextPoint(curve, 0)).to.equal(0);
			expect(progressToNextPoint(curve, 25)).to.equal(0.25);
			expect(progressToNextPoint(curve, 100)).to.equal(0);
			expect(progressToNextPoint(curve, 250)).to.equal(0.5);
		});

		it("rejects bad parameters", () => {
			expect(() => rootPrestige(0)).to.throw("unit > 0");
			expect(() => rootPrestige(100, 0.5)).to.throw("root >= 1");
			expect(() => logPrestige(100, 1)).to.throw("base > 1");
		});
	});

	describe("applyReset", () => {
		const defaults: PlayerData = {
			coins: 0,
			gems: 0,
			rebirths: 0,
			upgrades: { speed: 0, luck: 0 },
			unlockedZones: ["spawn"],
		};

		const state: PlayerData = {
			coins: 500,
			gems: 20,
			rebirths: 2,
			upgrades: { speed: 3, luck: 1 },
			unlockedZones: ["spawn", "desert"],
		};

		it("resets the listed keys and keeps the rest", () => {
			const result = applyReset(state, defaults, ["coins", "upgrades", "unlockedZones"]);
			expect(result.coins).to.equal(0);
			expect(result.upgrades.speed).to.equal(0);
			expect(result.unlockedZones.join(",")).to.equal("spawn");
			expect(result.gems).to.equal(20);
			expect(result.rebirths).to.equal(2);
		});

		it("leaves the original state alone", () => {
			applyReset(state, defaults, ["coins"]);
			expect(state.coins).to.equal(500);
		});

		it("copies defaults so later changes don't leak back into them", () => {
			const result = applyReset(state, defaults, ["upgrades", "unlockedZones"]);
			expect(result.upgrades).never.to.equal(defaults.upgrades);

			result.upgrades.speed = 5;
			result.unlockedZones.push("volcano");
			expect(defaults.upgrades.speed).to.equal(0);
			expect(defaults.unlockedZones.size()).to.equal(1);
		});
	});
};
