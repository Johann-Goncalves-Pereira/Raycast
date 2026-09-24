import Foundation

/// Empirical biomechanical and cognitive timing constants from the research report
/// (Module 1–4 / Module 6 synthesizer defaults). Midpoints of published ranges.
public struct ChronometryConfig: Sendable {
    /// Key pitch in millimeters (ANSI / ISO 19.05 mm).
    public var keyPitchMm: Double = 19.05

    /// Effective keycap actuation width for Fitts's Law (mm).
    public var fittsWeffMm: Double = 14.0

    /// Fitts intercept \(a\) — muscle reset / reversal (ms).
    public var fittsAMs: Double = 120.0

    /// Fitts slope \(b\) (ms/bit).
    public var fittsBMsPerBit: Double = 85.0

    /// Base motor \(\mu\) for intra-word ex-Gaussian IKI (ms), scaled by speed factor.
    public var motorMuMs: Double = 135.0

    /// Base motor \(\sigma\) (ms).
    public var motorSigmaMs: Double = 22.0

    /// Cognitive exponential tail \(\tau\) (ms).
    public var motorTauMs: Double = 45.0

    /// Cross-hand alternation speedup subtracted from \(\mu\) (ms).
    public var crossHandSpeedupMs: Double = 40.0

    /// Minimum IKI / flight floor (ms).
    public var flightFloorMs: Double = 40.0

    /// Hold-time log-normal geometric mean base (ms) before finger multiplier.
    public var holdGeometricMeanMs: Double = 80.0

    /// Hold log-normal \(\sigma_L\).
    public var holdSigmaLn: Double = 0.22

    /// Hold shift \(t_0\) (ms). Module 1 uses 35 ms; synthesizer blueprint uses 25 ms.
    public var holdShiftMs: Double = 25.0

    /// Hold clamp bounds (ms).
    public var holdMinMs: Double = 35.0
    public var holdMaxMs: Double = 200.0

    /// Post-space lexical retrieval pause (ex-Gaussian).
    public var wordBoundaryMuMs: Double = 160.0
    public var wordBoundarySigmaMs: Double = 30.0
    public var wordBoundaryTauMs: Double = 75.0

    /// Clause punctuation pause (ex-Gaussian).
    public var clauseMuMs: Double = 420.0
    public var clauseSigmaMs: Double = 65.0
    public var clauseTauMs: Double = 180.0

    /// Sentence / ideation Pareto pause.
    public var sentenceParetoTMinMs: Double = 1100.0
    public var sentenceParetoAlpha: Double = 1.45
    public var sentenceParetoTMaxMs: Double = 6000.0

    /// Substitution error probability per alphanumeric keystroke.
    public var errorProbability: Double = 0.025

    /// Spatial neighbor Gaussian \(\sigma = 0.65 \cdot \Delta p\).
    public var neighborSigmaPitchFraction: Double = 0.65

    /// Neighbor candidate radius in key pitches.
    public var neighborRadiusPitches: Double = 1.45

    /// Motor overrun length probabilities for \(N \in \{1,2,3\}\).
    public var overrunWeights = OverrunWeightTable()

    /// Cognitive freeze after error (ex-Gaussian).
    public var freezeMuMs: Double = 280.0
    public var freezeSigmaMs: Double = 45.0
    public var freezeTauMs: Double = 90.0

    /// Backspace flight (ex-Gaussian) and hold (Gaussian).
    public var backspaceFlightMuMs: Double = 85.0
    public var backspaceFlightSigmaMs: Double = 12.0
    public var backspaceFlightTauMs: Double = 25.0
    public var backspaceHoldMeanMs: Double = 55.0
    public var backspaceHoldSigmaMs: Double = 8.0
    public var backspaceHoldMinMs: Double = 30.0

    /// Post-correction resumption pause (ex-Gaussian).
    public var resumptionMuMs: Double = 380.0
    public var resumptionSigmaMs: Double = 60.0
    public var resumptionTauMs: Double = 120.0

    /// Cross-hand rollover probability when no cognitive pause.
    public var rolloverProbability: Double = 0.40

    /// Rollover overlap fraction of prior dwell (uniform range).
    public var rolloverOverlapMin: Double = 0.15
    public var rolloverOverlapMax: Double = 0.45

    /// Same-hand different-finger concurrency drag intercept (ms).
    public var sameHandDragInterceptMs: Double = 15.0

    /// Same-hand different-finger drag slope (ms per mm).
    public var sameHandDragSlopeMsPerMm: Double = 0.5

    /// Same-finger \(\sigma\) / \(\tau\) inflation.
    public var sameFingerSigmaScale: Double = 1.4
    public var sameFingerTauScale: Double = 1.2

    public init() {}

    /// Full research-report midpoints (~65 WPM synthesizer baseline).
    public static let research = ChronometryConfig()

    /// Alias for research midpoints (tests / hermetic sampling).
    public static let `default` = ChronometryConfig.research

    /// Raycast productivity profile: snappy, light jitter, no error theater.
    public static var practical: ChronometryConfig {
        var config = ChronometryConfig()
        config.motorMuMs = 55.0
        config.motorSigmaMs = 12.0
        config.motorTauMs = 18.0
        config.crossHandSpeedupMs = 20.0
        config.flightFloorMs = 18.0
        config.holdGeometricMeanMs = 45.0
        config.holdShiftMs = 15.0
        config.holdMinMs = 20.0
        config.holdMaxMs = 90.0
        config.wordBoundaryMuMs = 40.0
        config.wordBoundarySigmaMs = 10.0
        config.wordBoundaryTauMs = 20.0
        config.clauseMuMs = 80.0
        config.clauseSigmaMs = 20.0
        config.clauseTauMs = 30.0
        // Keep a slight sentence beat without multi-second freezes.
        config.sentenceParetoTMinMs = 120.0
        config.sentenceParetoAlpha = 1.6
        config.sentenceParetoTMaxMs = 280.0
        config.errorProbability = 0.0
        config.rolloverProbability = 0.25
        config.fittsAMs = 40.0
        config.fittsBMsPerBit = 30.0
        return config
    }

    /// Speed factor \(s = 60 / \mathrm{WPM}\) (larger = slower).
    public static func speedFactor(wpm: Double) -> Double {
        guard wpm > 0 else { return 1.0 }
        return 60.0 / wpm
    }
}

/// Discrete probabilities for motor overrun lengths 1, 2, and 3.
public struct OverrunWeightTable: Sendable, Equatable {
    public var one: Double
    public var two: Double
    public var three: Double

    public init(one: Double = 0.55, two: Double = 0.35, three: Double = 0.10) {
        self.one = one
        self.two = two
        self.three = three
    }

    public var total: Double { one + two + three }
}
