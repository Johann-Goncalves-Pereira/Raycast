import Foundation

/// Spatial neighbor typos and motor overrun sampling (Module 4 / 6).
public struct HumanErrorSimulator: Sendable {
    public var config: ChronometryConfig

    public init(config: ChronometryConfig = .default) {
        self.config = config
    }

    /// Weighted adjacent-key substitution; returns intended char if no neighbor.
    public mutating func adjacentNeighbor(
        of target: Character,
        rng: inout some RandomSource
    ) -> Character {
        let token = String(target).lowercased()
        guard token.count == 1, token != " " else { return target }

        let origin = KeyboardTopology.topology(for: token)
        let pitch = config.keyPitchMm
        let maxDistance = config.neighborRadiusPitches * pitch
        // Module 4: σ_spatial ≈ 0.65 · Δp
        let sigma = config.neighborSigmaPitchFraction * pitch
        let twoSigmaSq = 2.0 * sigma * sigma

        var candidates: [(Character, Double)] = []
        for key in KeyboardTopology.neighborSearchKeys {
            guard key != token else { continue }
            let topology = KeyboardTopology.topology(for: key)
            let distance = origin.distance(to: topology)
            guard distance <= maxDistance else { continue }
            let weight = Foundation.exp(-(distance * distance) / twoSigmaSq)
            if let char = key.first {
                candidates.append((char, weight))
            }
        }

        guard !candidates.isEmpty else { return target }

        let total = candidates.reduce(0.0) { $0 + $1.1 }
        guard total > 0 else { return target }

        var draw = rng.nextUnitInterval() * total
        for (char, weight) in candidates {
            draw -= weight
            if draw <= 0 {
                // Preserve intended case for letters
                if target.isUppercase, let upper = String(char).uppercased().first {
                    return upper
                }
                return char
            }
        }
        if let last = candidates.last {
            return last.0
        }
        return target
    }

    /// Motor overrun length \(N \in \{1,2,3\}\) with P ≈ (0.55, 0.35, 0.10).
    public mutating func sampleOverrunCount(rng: inout some RandomSource) -> Int {
        let weights = config.overrunWeights
        let draw = rng.nextUnitInterval() * weights.total
        if draw < weights.one { return 1 }
        if draw < weights.one + weights.two { return 2 }
        return 3
    }

    public mutating func shouldInjectError(
        for character: Character,
        rng: inout some RandomSource
    ) -> Bool {
        guard character.isLetter || character.isNumber else { return false }
        return rng.nextUnitInterval() < config.errorProbability
    }
}
