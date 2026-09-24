import Foundation

public enum KeyPhase: String, Sendable, Equatable {
    case down
    case keyUp
}

/// Scheduled low-level key event in synthesizer time (ms from stream start).
public struct ScheduledKeyEvent: Sendable, Equatable {
    public var key: String
    public var phase: KeyPhase
    public var timestampMs: Double

    public init(key: String, phase: KeyPhase, timestampMs: Double) {
        self.key = key
        self.phase = phase
        self.timestampMs = timestampMs
    }
}

/// Interval log row for optional `--log-timing` QA (down-to-down IKIs).
public struct TimingSample: Sendable, Equatable {
    public var fromIndex: Int
    public var toIndex: Int
    public var ikiMs: Double
    public var kind: String

    public init(fromIndex: Int, toIndex: Int, ikiMs: Double, kind: String) {
        self.fromIndex = fromIndex
        self.toIndex = toIndex
        self.ikiMs = ikiMs
        self.kind = kind
    }
}

/// Mutable scheduling cursor shared across pipeline steps.
private struct ScheduleCursor {
    var currentTimeMs: Double
    var previousChar: Character
    var previousDwellMs: Double
    var events: [ScheduledKeyEvent]
}

/// Pure event scheduler: IDLE → key pipeline / ERROR_PIPELINE (Module 6).
public struct EventScheduler: Sendable {
    public var config: ChronometryConfig
    public var speedFactor: Double
    public var biomechanics: BiomechanicalEngine
    public var linguistics: LinguisticScheduler
    public var errors: HumanErrorSimulator

    public private(set) var timingLog: [TimingSample] = []

    public init(
        config: ChronometryConfig = .default,
        wpm: Double = 65.0
    ) {
        self.config = config
        self.speedFactor = ChronometryConfig.speedFactor(wpm: wpm)
        self.biomechanics = BiomechanicalEngine(config: config)
        self.linguistics = LinguisticScheduler(config: config)
        self.errors = HumanErrorSimulator(config: config)
    }

    public mutating func generate(
        text: String,
        rng: inout some RandomSource
    ) -> [ScheduledKeyEvent] {
        timingLog.removeAll(keepingCapacity: true)
        var cursor = ScheduleCursor(
            currentTimeMs: 1_000.0,
            previousChar: " ",
            previousDwellMs: 0,
            events: []
        )
        cursor.previousDwellMs = biomechanics.holdMs(
            for: cursor.previousChar,
            speedFactor: speedFactor,
            rng: &rng
        )

        let characters = Array(text)
        var index = 0
        var charsSinceThinking = 0
        var nextThinkingThreshold = sampleThinkingThreshold(rng: &rng)
        let thinkingAllowed =
            config.thinkingEnabled && characters.count >= config.thinkingMinChars

        while index < characters.count {
            let target = characters[index]

            // CHUNK_EVALUATION → optional ERROR_PIPELINE
            if errors.shouldInjectError(for: target, rng: &rng) {
                let errorStart = cursor.currentTimeMs
                scheduleErrorPipeline(
                    text: characters,
                    at: index,
                    cursor: &cursor,
                    rng: &rng
                )
                timingLog.append(
                    TimingSample(
                        fromIndex: index,
                        toIndex: index,
                        ikiMs: cursor.currentTimeMs - errorStart,
                        kind: "error_pipeline"
                    )
                )
                // After correction, type the intended glyph once (no re-roll).
                scheduleCorrectCharacter(
                    target: target,
                    at: index,
                    cursor: &cursor,
                    rng: &rng
                )
                index += 1
                charsSinceThinking += 1
                if thinkingAllowed {
                    maybeInsertThinkingPause(
                        at: index,
                        charsSinceThinking: &charsSinceThinking,
                        nextThreshold: &nextThinkingThreshold,
                        cursor: &cursor,
                        rng: &rng
                    )
                }
                continue
            }

            scheduleCorrectCharacter(
                target: target,
                at: index,
                cursor: &cursor,
                rng: &rng
            )
            index += 1
            charsSinceThinking += 1
            if thinkingAllowed {
                maybeInsertThinkingPause(
                    at: index,
                    charsSinceThinking: &charsSinceThinking,
                    nextThreshold: &nextThinkingThreshold,
                    cursor: &cursor,
                    rng: &rng
                )
            }
        }

        return cursor.events.sorted(by: Self.eventOrder)
    }

    private mutating func maybeInsertThinkingPause(
        at index: Int,
        charsSinceThinking: inout Int,
        nextThreshold: inout Int,
        cursor: inout ScheduleCursor,
        rng: inout some RandomSource
    ) {
        guard charsSinceThinking >= nextThreshold else { return }
        let span = config.thinkingPauseMaxMs - config.thinkingPauseMinMs
        let thinkingMs =
            config.thinkingPauseMinMs + rng.nextUnitInterval() * max(span, 0)
        cursor.currentTimeMs += thinkingMs
        timingLog.append(
            TimingSample(
                fromIndex: max(0, index - 1),
                toIndex: index,
                ikiMs: thinkingMs,
                kind: "thinking"
            )
        )
        charsSinceThinking = 0
        nextThreshold = sampleThinkingThreshold(rng: &rng)
    }

    private mutating func sampleThinkingThreshold(rng: inout some RandomSource) -> Int {
        let low = max(1, config.thinkingEveryCharsMin)
        let high = max(low, config.thinkingEveryCharsMax)
        let span = high - low
        let draw = Int((rng.nextUnitInterval() * Double(span)).rounded(.down))
        return low + min(draw, span)
    }

    private static func eventOrder(_ lhs: ScheduledKeyEvent, _ rhs: ScheduledKeyEvent) -> Bool {
        if lhs.timestampMs != rhs.timestampMs {
            return lhs.timestampMs < rhs.timestampMs
        }
        if lhs.phase != rhs.phase {
            return lhs.phase == .down
        }
        return lhs.key < rhs.key
    }

    private mutating func scheduleCorrectCharacter(
        target: Character,
        at index: Int,
        cursor: inout ScheduleCursor,
        rng: inout some RandomSource
    ) {
        let flight = biomechanics.digraphLatencyMs(
            from: cursor.previousChar,
            to: target,
            speedFactor: speedFactor,
            rng: &rng
        )
        let cognitive = linguistics.pauseOverheadMs(after: cursor.previousChar, rng: &rng)
        var iki = flight + cognitive

        let prevTopo = KeyboardTopology.topology(for: cursor.previousChar)
        let nextTopo = KeyboardTopology.topology(for: target)
        if prevTopo.hand != nextTopo.hand,
           cognitive == 0.0,
           rng.nextUnitInterval() < config.rolloverProbability {
            let span = config.rolloverOverlapMax - config.rolloverOverlapMin
            let overlapFraction =
                config.rolloverOverlapMin + rng.nextUnitInterval() * span
            let overlap = overlapFraction * cursor.previousDwellMs
            iki = max(config.flightFloorMs, cursor.previousDwellMs - overlap)
        }

        let downTime = cursor.currentTimeMs + iki
        let dwell = biomechanics.holdMs(
            for: target,
            speedFactor: speedFactor,
            rng: &rng
        )
        schedulePress(key: String(target), downAt: downTime, holdMs: dwell, cursor: &cursor)

        timingLog.append(
            TimingSample(
                fromIndex: max(0, index - 1),
                toIndex: index,
                ikiMs: iki,
                kind: cognitiveKind(after: cursor.previousChar)
            )
        )

        cursor.currentTimeMs = downTime
        cursor.previousChar = target
        cursor.previousDwellMs = dwell
    }

    private func cognitiveKind(after previous: Character) -> String {
        if previous == "." || previous == "!" || previous == "?" {
            return "sentence"
        }
        if previous == "," || previous == ";" || previous == ":" || previous == "-" {
            return "clause"
        }
        if previous == " " {
            return "word"
        }
        return "intra_word"
    }

    private mutating func scheduleErrorPipeline(
        text: [Character],
        at index: Int,
        cursor: inout ScheduleCursor,
        rng: inout some RandomSource
    ) {
        let intended = text[index]

        // INJECT_ADJACENT_TYPO
        let errChar = errors.adjacentNeighbor(of: intended, rng: &rng)
        let errDwell = biomechanics.holdMs(
            for: errChar,
            speedFactor: speedFactor,
            rng: &rng
        )
        schedulePress(
            key: String(errChar),
            downAt: cursor.currentTimeMs,
            holdMs: errDwell,
            cursor: &cursor
        )

        // MOTOR_INERTIA_OVERRUN
        let overrunTyped = scheduleOverrun(
            text: text,
            after: index,
            startingFrom: errChar,
            cursor: &cursor,
            rng: &rng
        )

        // COGNITIVE_FREEZE
        cursor.currentTimeMs += biomechanics.sampler.sampleExGaussian(
            mu: config.freezeMuMs,
            sigma: config.freezeSigmaMs,
            tau: config.freezeTauMs,
            rng: &rng
        )

        // BURST_BACKSPACE
        scheduleBackspaceBurst(count: 1 + overrunTyped.count, cursor: &cursor, rng: &rng)

        // RESUMPTION_PAUSE
        cursor.currentTimeMs += biomechanics.sampler.sampleExGaussian(
            mu: config.resumptionMuMs,
            sigma: config.resumptionSigmaMs,
            tau: config.resumptionTauMs,
            rng: &rng
        )
        cursor.previousChar = " "
        cursor.previousDwellMs = biomechanics.holdMs(
            for: cursor.previousChar,
            speedFactor: speedFactor,
            rng: &rng
        )
    }

    private mutating func scheduleOverrun(
        text: [Character],
        after index: Int,
        startingFrom errChar: Character,
        cursor: inout ScheduleCursor,
        rng: inout some RandomSource
    ) -> [Character] {
        let overrunCount = errors.sampleOverrunCount(rng: &rng)
        var lastChar = errChar
        var overrunTyped: [Character] = []
        var overrunIdx = 1
        while overrunIdx <= overrunCount, index + overrunIdx < text.count {
            let nextIntended = text[index + overrunIdx]
            let flight = biomechanics.digraphLatencyMs(
                from: lastChar,
                to: nextIntended,
                speedFactor: speedFactor,
                rng: &rng
            )
            cursor.currentTimeMs += flight
            let ovrDwell = biomechanics.holdMs(
                for: nextIntended,
                speedFactor: speedFactor,
                rng: &rng
            )
            schedulePress(
                key: String(nextIntended),
                downAt: cursor.currentTimeMs,
                holdMs: ovrDwell,
                cursor: &cursor
            )
            overrunTyped.append(nextIntended)
            lastChar = nextIntended
            overrunIdx += 1
        }
        return overrunTyped
    }

    private mutating func scheduleBackspaceBurst(
        count: Int,
        cursor: inout ScheduleCursor,
        rng: inout some RandomSource
    ) {
        for _ in 0..<count {
            cursor.currentTimeMs += biomechanics.sampler.sampleExGaussian(
                mu: config.backspaceFlightMuMs * speedFactor,
                sigma: config.backspaceFlightSigmaMs,
                tau: config.backspaceFlightTauMs,
                rng: &rng
            )
            let bsHold = max(
                config.backspaceHoldMinMs,
                biomechanics.sampler.sampleGaussian(
                    mean: config.backspaceHoldMeanMs,
                    stdDev: config.backspaceHoldSigmaMs,
                    rng: &rng
                )
            )
            schedulePress(
                key: KeyboardTopology.backspaceToken,
                downAt: cursor.currentTimeMs,
                holdMs: bsHold,
                cursor: &cursor
            )
        }
    }

    private func schedulePress(
        key: String,
        downAt: Double,
        holdMs: Double,
        cursor: inout ScheduleCursor
    ) {
        cursor.events.append(ScheduledKeyEvent(key: key, phase: .down, timestampMs: downAt))
        cursor.events.append(
            ScheduledKeyEvent(key: key, phase: .keyUp, timestampMs: downAt + holdMs)
        )
    }
}
