import Foundation

/// Hierarchical linguistic pause overhead at chunk boundaries (Module 3 / 6).
public struct LinguisticScheduler: Sendable {
    public var config: ChronometryConfig
    public var sampler: ChronometrySampler

    public init(config: ChronometryConfig = .default) {
        self.config = config
        self.sampler = ChronometrySampler(config: config)
    }

    /// Extra ms added to digraph latency based on the previous character's boundary class.
    public mutating func pauseOverheadMs(
        after previous: Character,
        rng: inout some RandomSource
    ) -> Double {
        // Level 4: sentence / ideation — bounded Pareto (Module 1 / 3)
        if previous == "." || previous == "!" || previous == "?" {
            return sampler.sampleBoundedPareto(
                tMin: config.sentenceParetoTMinMs,
                alpha: config.sentenceParetoAlpha,
                tMax: config.sentenceParetoTMaxMs,
                rng: &rng
            )
        }

        // Level 3: clause / syntactic punctuation
        if previous == "," || previous == ";" || previous == ":" || previous == "—"
            || previous == "-" {
            return sampler.sampleExGaussian(
                mu: config.clauseMuMs,
                sigma: config.clauseSigmaMs,
                tau: config.clauseTauMs,
                rng: &rng
            )
        }

        // Level 2: post-space lexical retrieval
        if previous == " " {
            return sampler.sampleExGaussian(
                mu: config.wordBoundaryMuMs,
                sigma: config.wordBoundarySigmaMs,
                tau: config.wordBoundaryTauMs,
                rng: &rng
            )
        }

        // Level 1: intra-word — no extra cognitive overhead
        return 0.0
    }
}
