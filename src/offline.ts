import { isFiniteNumber, saturate } from "./numbers";

export interface OfflineTier {
	readonly duration: number;
	readonly efficiency: number;
}

export interface OfflineResult {
	readonly earned: number;
	readonly away: number;
	/** seconds that paid out, never more than the tiers cover */
	readonly credited: number;
}

/**
 * lastOnline and now have to be server timestamps (os.time() saved with the player's data), never
 * something the client sent, otherwise moving the device clock forward prints currency
 */
export function offlineEarnings(
	ratePerSecond: number,
	lastOnline: number,
	now: number,
	tiers: ReadonlyArray<OfflineTier>,
): OfflineResult {
	const away = now - lastOnline;
	// a clock skew between servers can make `now` land before the last save
	if (!isFiniteNumber(away) || away <= 0 || !(ratePerSecond > 0)) {
		return { earned: 0, away: isFiniteNumber(away) ? math.max(0, away) : 0, credited: 0 };
	}

	let remaining = away;
	let weighted = 0;
	let credited = 0;
	for (const tier of tiers) {
		if (!(tier.duration >= 0) || !(tier.efficiency >= 0) || !isFiniteNumber(tier.efficiency)) {
			throw `offline tiers need non-negative values, got ${tier.duration}s at ${tier.efficiency}`;
		}
		const span = math.min(remaining, tier.duration);
		weighted += span * tier.efficiency;
		credited += span;
		remaining -= span;
		if (remaining <= 0) {
			break;
		}
	}

	return { earned: saturate(ratePerSecond * weighted), away, credited };
}

/** full rate for `fullRateFor` seconds, then `reducedEfficiency` until `cap` seconds, then nothing */
export function falloffTiers(fullRateFor: number, cap: number, reducedEfficiency: number): OfflineTier[] {
	if (!(fullRateFor > 0) || !(cap >= fullRateFor)) {
		throw `falloff needs 0 < fullRateFor <= cap, got ${fullRateFor} and ${cap}`;
	}
	if (!(reducedEfficiency >= 0 && reducedEfficiency <= 1)) {
		throw `reduced efficiency must be between 0 and 1, got ${reducedEfficiency}`;
	}

	const tiers: OfflineTier[] = [{ duration: fullRateFor, efficiency: 1 }];
	if (cap > fullRateFor) {
		tiers.push({ duration: cap - fullRateFor, efficiency: reducedEfficiency });
	}
	return tiers;
}
