import Foundation

/// Digraph latency and hold sampling from keyboard geometry (Module 2 / 6).
public struct BiomechanicalEngine: Sendable {
    public var config: ChronometryConfig
    public var sampler: ChronometrySampler

    public init(config: ChronometryConfig = .default) {
        self.config = config
        self.sampler = ChronometrySampler(config: config)
    }

    /// Down-to-down style flight / IKI base before linguistic overhead (ms).
    public mutating func digraphLatencyMs(
        from previous: Character,
        to next: Character,
        speedFactor: Double,
        rng: inout some RandomSource
    ) -> Double {
        digraphLatencyMs(
            from: String(previous),
            to: String(next),
            speedFactor: speedFactor,
            rng: &rng
        )
    }

    public mutating func digraphLatencyMs(
        from previous: String,
        to next: String,
        speedFactor: Double,
        rng: inout some RandomSource
    ) -> Double {
        let a = KeyboardTopology.topology(for: previous)
        let b = KeyboardTopology.topology(for: next)

        var mu = config.motorMuMs * speedFactor
        var sigma = config.motorSigmaMs * speedFactor
        var tau = config.motorTauMs * speedFactor

        // Case A: cross-hand pipelining — Module 2 speedup ~30–60 ms
        if a.hand != b.hand {
            mu -= config.crossHandSpeedupMs * speedFactor
            let sample = sampler.sampleExGaussian(mu: mu, sigma: sigma, tau: tau, rng: &rng)
            return max(config.flightFloorMs, sample)
        }

        let distance = a.distance(to: b)

        // Case B: same finger — Fitts's Law refractory penalty (Module 2 / 6)
        if a.finger == b.finger {
            let indexOfDifficulty = Foundation.log2((distance / config.fittsWeffMm) + 1.0)
            let fittsDelay = config.fittsAMs + config.fittsBMsPerBit * indexOfDifficulty
            let fingerScale = 1.0 / a.finger.speedFactor
            mu = (mu + fittsDelay) * fingerScale
            sigma *= config.sameFingerSigmaScale
            tau *= config.sameFingerTauScale
            return max(
                config.flightFloorMs,
                sampler.sampleExGaussian(mu: mu, sigma: sigma, tau: tau, rng: &rng)
            )
        }

        // Case C: same-hand, different finger — tendon coupling drag
        let drag = config.sameHandDragInterceptMs + config.sameHandDragSlopeMsPerMm * distance
        let fingerMod = 1.0 / b.finger.speedFactor
        mu = (mu + drag) * fingerMod
        return max(
            config.flightFloorMs,
            sampler.sampleExGaussian(mu: mu, sigma: sigma, tau: tau, rng: &rng)
        )
    }

    public mutating func holdMs(
        for character: Character,
        speedFactor: Double,
        rng: inout some RandomSource
    ) -> Double {
        holdMs(for: String(character), speedFactor: speedFactor, rng: &rng)
    }

    public mutating func holdMs(
        for token: String,
        speedFactor: Double,
        rng: inout some RandomSource
    ) -> Double {
        let topology = KeyboardTopology.topology(for: token)
        return sampler.sampleHoldMs(
            finger: topology.finger,
            speedFactor: speedFactor,
            rng: &rng
        )
    }
}
