/// <reference types="@rbxts/testez/globals" />

import { isFiniteNumber, MAX_EXACT_INTEGER, MAX_VALUE, saturate } from "..";

export = () => {
	describe("numbers", () => {
		it("only calls real finite values finite", () => {
			expect(isFiniteNumber(1.5)).to.equal(true);
			expect(isFiniteNumber(-MAX_VALUE)).to.equal(true);
			expect(isFiniteNumber(0 / 0)).to.equal(false);
			expect(isFiniteNumber(math.huge)).to.equal(false);
			expect(isFiniteNumber(-math.huge)).to.equal(false);
		});

		it("saturates infinities and replaces nan", () => {
			expect(saturate(5)).to.equal(5);
			expect(saturate(math.huge)).to.equal(MAX_VALUE);
			expect(saturate(-math.huge)).to.equal(-MAX_VALUE);
			expect(saturate(0 / 0)).to.equal(0);
			expect(saturate(0 / 0, 1)).to.equal(1);
		});

		it("marks where doubles stop counting every integer", () => {
			expect(MAX_EXACT_INTEGER).to.equal(9007199254740992);
			expect(MAX_EXACT_INTEGER + 1).to.equal(MAX_EXACT_INTEGER);
		});
	});
};
