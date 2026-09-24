import Foundation

/// Seedable RNG for deterministic tests; production uses `SystemRandomNumberGenerator`.
public protocol RandomSource: Sendable {
    mutating func nextUnitInterval() -> Double
}

public struct SystemRandomSource: RandomSource {
    public init() {}

    public mutating func nextUnitInterval() -> Double {
        Double.random(in: 0.0..<1.0)
    }
}

/// Fixed sequence of unit-interval draws for tests.
public struct SequenceRandomSource: RandomSource {
    private var values: [Double]
    private var index: Int = 0

    public init(_ values: [Double]) {
        self.values = values
    }

    public mutating func nextUnitInterval() -> Double {
        guard !values.isEmpty else { return 0.5 }
        let value = values[index % values.count]
        index += 1
        return min(max(value, 1e-12), 1.0 - 1e-12)
    }
}

/// Box-Muller / inverse-CDF samplers for keystroke chronometry (Module 1, 6).
public struct ChronometrySampler: Sendable {
    public var config: ChronometryConfig

    public init(config: ChronometryConfig = .default) {
        self.config = config
    }

    /// Standard normal via Box-Muller.
    public mutating func sampleStandardNormal(rng: inout some RandomSource) -> Double {
        let unitA = max(1e-12, rng.nextUnitInterval())
        let unitB = rng.nextUnitInterval()
        return (-2.0 * Foundation.log(unitA)).squareRoot()
            * Foundation.cos(2.0 * Double.pi * unitB)
    }

    public mutating func sampleGaussian(
        mean: Double,
        stdDev: Double,
        rng: inout some RandomSource
    ) -> Double {
        mean + stdDev * sampleStandardNormal(rng: &rng)
    }

    /// Ex-Gaussian = Gaussian(motor) + Exponential(cognitive \(\tau\)).
    public mutating func sampleExGaussian(
        mu: Double,
        sigma: Double,
        tau: Double,
        rng: inout some RandomSource
    ) -> Double {
        let motor = sampleGaussian(mean: mu, stdDev: sigma, rng: &rng)
        let unit = max(1e-12, rng.nextUnitInterval())
        let cognitive = -tau * Foundation.log(unit)
        return motor + cognitive
    }

    /// Log-normal via \(\exp(\mu_L + \sigma_L Z)\).
    public mutating func sampleLogNormal(
        muLn: Double,
        sigmaLn: Double,
        rng: inout some RandomSource
    ) -> Double {
        let standard = sampleStandardNormal(rng: &rng)
        return Foundation.exp(muLn + sigmaLn * standard)
    }

    /// Bounded Pareto for sentence / ideation pauses (Module 1).
    public mutating func sampleBoundedPareto(
        tMin: Double,
        alpha: Double,
        tMax: Double,
        rng: inout some RandomSource
    ) -> Double {
        let unit = rng.nextUnitInterval()
        let raw = tMin / Foundation.pow(1.0 - unit, 1.0 / alpha)
        return min(raw, tMax)
    }

    public mutating func sampleHoldMs(
        finger: TypingFinger,
        speedFactor: Double,
        rng: inout some RandomSource
    ) -> Double {
        // Module 1 / 6: shifted log-normal hold; μ_L = ln(80 · s · M_f^-0.5)
        let fingerMultiplier = 1.0 / finger.speedFactor.squareRoot()
        let geometric = config.holdGeometricMeanMs * speedFactor * fingerMultiplier
        let muLn = Foundation.log(max(geometric, 1e-6))
        let sample = config.holdShiftMs + sampleLogNormal(
            muLn: muLn,
            sigmaLn: config.holdSigmaLn,
            rng: &rng
        )
        return min(max(sample, config.holdMinMs), config.holdMaxMs)
    }
}
