import Foundation
import HumanizedTypeCore
import Testing

@Suite("ChronometrySampler")
struct ChronometrySamplerTests {
    @Test("hold samples respect min/max clamps")
    func holdClamps() {
        var sampler = ChronometrySampler()
        // Extreme unit draws still clamp after shift + exp
        var rng = SequenceRandomSource([1e-12, 0.5, 1.0 - 1e-12, 0.5])
        for _ in 0..<20 {
            let hold = sampler.sampleHoldMs(
                finger: .index,
                speedFactor: 1.0,
                rng: &rng
            )
            #expect(hold >= ChronometryConfig.default.holdMinMs)
            #expect(hold <= ChronometryConfig.default.holdMaxMs)
        }
    }

    @Test("bounded Pareto never below tMin and never above tMax")
    func paretoBounds() {
        var sampler = ChronometrySampler()
        let tMin = 1100.0
        let tMax = 6000.0
        var rng = SequenceRandomSource([0.01, 0.5, 0.99, 0.999])
        for _ in 0..<8 {
            let sample = sampler.sampleBoundedPareto(
                tMin: tMin,
                alpha: 1.45,
                tMax: tMax,
                rng: &rng
            )
            #expect(sample >= tMin)
            #expect(sample <= tMax)
        }
    }

    @Test("ex-Gaussian mean roughly tracks mu + tau")
    func exGaussianCentralTendency() {
        var sampler = ChronometrySampler()
        var rng = SystemRandomSource()
        let mu = 135.0
        let sigma = 22.0
        let tau = 45.0
        var sum = 0.0
        let n = 2_000
        for _ in 0..<n {
            sum += sampler.sampleExGaussian(mu: mu, sigma: sigma, tau: tau, rng: &rng)
        }
        let mean = sum / Double(n)
        // E[X] = μ + τ; allow generous Monte Carlo slack
        #expect(abs(mean - (mu + tau)) < 15.0)
    }
}

@Suite("BiomechanicalEngine")
struct BiomechanicalEngineTests {
    @Test("cross-hand digraph is faster than same-finger on fixed RNG")
    func crossHandFasterThanSameFinger() {
        // Deterministic mid-range draws so distribution noise does not flip the order
        let draws = Array(repeating: 0.5, count: 64)
        var engineA = BiomechanicalEngine()
        var engineB = BiomechanicalEngine()
        var rngCross = SequenceRandomSource(draws)
        var rngSame = SequenceRandomSource(draws)

        let cross = engineA.digraphLatencyMs(
            from: "a",
            to: "j",
            speedFactor: 1.0,
            rng: &rngCross
        )
        let sameFinger = engineB.digraphLatencyMs(
            from: "f",
            to: "f",
            speedFactor: 1.0,
            rng: &rngSame
        )
        #expect(cross < sameFinger)
    }

    @Test("flight never drops below floor")
    func flightFloor() {
        var engine = BiomechanicalEngine()
        var rng = SequenceRandomSource([1e-12, 1e-12, 1e-12, 1e-12])
        let latency = engine.digraphLatencyMs(
            from: "a",
            to: "l",
            speedFactor: 0.5,
            rng: &rng
        )
        #expect(latency >= ChronometryConfig.default.flightFloorMs)
    }
}

@Suite("HumanErrorSimulator")
struct HumanErrorSimulatorTests {
    @Test("neighbor stays within geometric radius of target")
    func neighborProximity() {
        var errors = HumanErrorSimulator()
        var rng = SystemRandomSource()
        let target: Character = "g"
        let origin = KeyboardTopology.topology(for: target)
        let maxDistance =
            ChronometryConfig.default.neighborRadiusPitches * ChronometryConfig.default.keyPitchMm

        for _ in 0..<40 {
            let neighbor = errors.adjacentNeighbor(of: target, rng: &rng)
            let topo = KeyboardTopology.topology(for: neighbor)
            #expect(origin.distance(to: topo) <= maxDistance + 1e-6)
        }
    }

    @Test("overrun length is only 1, 2, or 3")
    func overrunDomain() {
        var errors = HumanErrorSimulator()
        var rng = SystemRandomSource()
        for _ in 0..<200 {
            let n = errors.sampleOverrunCount(rng: &rng)
            #expect(n == 1 || n == 2 || n == 3)
        }
    }

    @Test("non-alphanumeric never triggers error injection flag")
    func onlyAlphanumericErrors() {
        var errors = HumanErrorSimulator()
        var rng = SequenceRandomSource([0.0]) // would always fire if checked
        #expect(errors.shouldInjectError(for: " ", rng: &rng) == false)
        #expect(errors.shouldInjectError(for: ".", rng: &rng) == false)
    }
}

@Suite("EventScheduler")
struct EventSchedulerTests {
    @Test("generates paired down/up events for simple text")
    func pairedEvents() {
        var config = ChronometryConfig.default
        config.errorProbability = 0
        var scheduler = EventScheduler(config: config, wpm: 65)
        var rng = SequenceRandomSource(Array(repeating: 0.5, count: 256))
        let events = scheduler.generate(text: "hi", rng: &rng)
        let downs = events.filter { $0.phase == .down }
        let ups = events.filter { $0.phase == .keyUp }
        #expect(downs.count == ups.count)
        #expect(downs.count == 2)
        for pair in zip(events, events.dropFirst()) {
            #expect(pair.0.timestampMs <= pair.1.timestampMs)
        }
    }

    @Test("sentence boundary produces larger IKI than intra-word")
    func sentencePauseLarger() {
        var config = ChronometryConfig.research
        config.errorProbability = 0
        var scheduler = EventScheduler(config: config, wpm: 65)
        var rng = SequenceRandomSource(Array(repeating: 0.5, count: 512))
        _ = scheduler.generate(text: "Ok. Yes", rng: &rng)
        let sentence = scheduler.timingLog.first { $0.kind == "sentence" }
        let intra = scheduler.timingLog.first { $0.kind == "intra_word" }
        #expect(sentence != nil)
        #expect(intra != nil)
        if let sentence, let intra {
            #expect(sentence.ikiMs > intra.ikiMs)
        }
    }

    @Test("practical profile is faster than research on same digraph")
    func practicalFasterThanResearch() {
        let draws = Array(repeating: 0.5, count: 64)
        var research = BiomechanicalEngine(config: .research)
        var practical = BiomechanicalEngine(config: .practical)
        var rngA = SequenceRandomSource(draws)
        var rngB = SequenceRandomSource(draws)
        let slow = research.digraphLatencyMs(
            from: "t",
            to: "h",
            speedFactor: ChronometryConfig.speedFactor(wpm: 65),
            rng: &rngA
        )
        let fast = practical.digraphLatencyMs(
            from: "t",
            to: "h",
            speedFactor: ChronometryConfig.speedFactor(wpm: 190),
            rng: &rngB
        )
        #expect(fast < slow)
    }

    @Test("long paste inserts thinking pause between 5s and 15s")
    func thinkingPauseOnLongPaste() {
        var config = ChronometryConfig.practical
        config.errorProbability = 0
        config.thinkingEnabled = true
        config.thinkingMinChars = 200
        config.thinkingEveryCharsMin = 400
        config.thinkingEveryCharsMax = 400
        config.thinkingPauseMinMs = 5_000
        config.thinkingPauseMaxMs = 15_000
        var scheduler = EventScheduler(config: config, wpm: 190)
        var rng = SequenceRandomSource(Array(repeating: 0.5, count: 8_000))
        let text = String(repeating: "abcdefghij ", count: 50) // 550 chars
        _ = scheduler.generate(text: text, rng: &rng)
        let thinking = scheduler.timingLog.filter { $0.kind == "thinking" }
        #expect(!thinking.isEmpty)
        for sample in thinking {
            #expect(sample.ikiMs >= 5_000)
            #expect(sample.ikiMs <= 15_000)
        }
    }

    @Test("short paste skips thinking pauses")
    func noThinkingOnShortPaste() {
        var config = ChronometryConfig.practical
        config.errorProbability = 0
        config.thinkingEnabled = true
        config.thinkingMinChars = 200
        var scheduler = EventScheduler(config: config, wpm: 190)
        var rng = SequenceRandomSource(Array(repeating: 0.5, count: 512))
        _ = scheduler.generate(text: "short only", rng: &rng)
        let thinking = scheduler.timingLog.filter { $0.kind == "thinking" }
        #expect(thinking.isEmpty)
    }

    @Test("error pipeline emits backspace tokens")
    func errorEmitsBackspace() {
        var config = ChronometryConfig.default
        config.errorProbability = 1.0
        var scheduler = EventScheduler(config: config, wpm: 65)
        // Neighbor + overrun + freeze draws; first unit interval triggers error
        var rng = SequenceRandomSource(
            [0.0] + Array(repeating: 0.5, count: 512)
        )
        let events = scheduler.generate(text: "abcd", rng: &rng)
        let backspaces = events.filter { $0.key == KeyboardTopology.backspaceToken }
        #expect(!backspaces.isEmpty)
    }

    @Test("error pipeline net text equals source")
    func errorPipelineNetsToSource() {
        var config = ChronometryConfig.practical
        config.errorProbability = 1.0
        config.thinkingEnabled = false
        let samples = [
            "hello",
            "the quick brown fox",
            "AbCd Ef!",
            String(repeating: "typing ", count: 20),
        ]
        for text in samples {
            var scheduler = EventScheduler(config: config, wpm: 190)
            var rng = SequenceRandomSource(
                [0.0] + Array(repeating: 0.37, count: 20_000)
            )
            let events = scheduler.generate(text: text, rng: &rng)
            let net = TranscriptReplay.netText(from: events)
            #expect(net == text)
        }
    }

    @Test("zero-error schedule nets to source")
    func cleanScheduleNetsToSource() {
        var config = ChronometryConfig.practical
        config.errorProbability = 0
        config.thinkingEnabled = false
        var scheduler = EventScheduler(config: config, wpm: 190)
        var rng = SequenceRandomSource(Array(repeating: 0.5, count: 4_000))
        let text = "clean schedule path"
        let events = scheduler.generate(text: text, rng: &rng)
        #expect(TranscriptReplay.netText(from: events) == text)
    }
}

@Suite("FocusFingerprint")
struct FocusFingerprintTests {
    @Test("different pid does not match")
    func differentPid() {
        let a = FocusFingerprint(pid: 1, role: "AXTextField", windowTitle: "Doc")
        let b = FocusFingerprint(pid: 2, role: "AXTextField", windowTitle: "Doc")
        #expect(!a.matches(b))
    }

    @Test("different document URL pauses")
    func differentURL() {
        let a = FocusFingerprint(
            pid: 1,
            role: "AXTextArea",
            windowTitle: "Chrome",
            documentURL: "https://a.example/"
        )
        let b = FocusFingerprint(
            pid: 1,
            role: "AXTextArea",
            windowTitle: "Chrome",
            documentURL: "https://b.example/"
        )
        #expect(!a.matches(b))
    }

    @Test("same fingerprint matches")
    func sameFingerprint() {
        let a = FocusFingerprint(
            pid: 42,
            role: "AXTextField",
            windowTitle: "Notes",
            documentURL: ""
        )
        let b = FocusFingerprint(
            pid: 42,
            role: "AXTextField",
            windowTitle: "Notes",
            documentURL: ""
        )
        #expect(a.matches(b))
    }

    @Test("generic element title does not match a different window title")
    func differentWindowTitle() {
        let elementTitle = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Conteúdo do documento"
        )
        let windowTitle = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Notes - Google Docs"
        )
        #expect(!elementTitle.matches(windowTitle))
    }

    @Test("same URL with a different window title does not match")
    func sameURLDifferentWindowTitle() {
        let left = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Doc A - Google Docs",
            documentURL: "https://docs.google.com/document/d/abc"
        )
        let right = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Doc B - Google Docs",
            documentURL: "https://docs.google.com/document/d/abc"
        )
        #expect(!left.matches(right))
    }

    @Test("different frame does not match")
    func differentFrame() {
        let left = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Conteúdo do documento",
            frame: FocusFrame(x: 10, y: 20, width: 400, height: 200)
        )
        let right = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Conteúdo do documento",
            frame: FocusFrame(x: 10, y: 80, width: 400, height: 200)
        )
        #expect(!left.matches(right))
    }

    @Test("similar frame is not the locked field when the element differs")
    func similarFrameDifferentElement() {
        let same = FocusFingerprint.stillOnField(
            frontmostPIDMatches: true,
            fingerprintMatches: true,
            elementEqual: true,
            windowIDMatches: true
        )
        let otherField = FocusFingerprint.stillOnField(
            frontmostPIDMatches: true,
            fingerprintMatches: true,
            elementEqual: false,
            windowIDMatches: true
        )
        let otherWindow = FocusFingerprint.stillOnField(
            frontmostPIDMatches: true,
            fingerprintMatches: true,
            elementEqual: true,
            windowIDMatches: false
        )
        #expect(same)
        #expect(!otherField)
        #expect(!otherWindow)
    }

    @Test("another app keeps the virtual keyboard on the locked window")
    func virtualKeyIgnoresOtherApp() {
        let stillDocs = FocusFingerprint.shouldDeliverVirtualKey(
            lockedWindowID: 100,
            browserFocusedWindowID: 100
        )
        #expect(stillDocs)
    }

    @Test("another window of the same browser does not receive a virtual key")
    func virtualKeyBlocksOtherBrowserWindow() {
        let otherTab = FocusFingerprint.shouldDeliverVirtualKey(
            lockedWindowID: 100,
            browserFocusedWindowID: 200
        )
        #expect(!otherTab)
    }

    @Test("another desktop app is not the locked window")
    func otherDesktop() {
        let same = FocusFingerprint.stillOnScreen(
            lockedPID: 10,
            lockedWindowID: 100,
            currentPID: 10,
            currentWindowID: 100
        )
        let cursorOnOtherSpace = FocusFingerprint.stillOnScreen(
            lockedPID: 10,
            lockedWindowID: 100,
            currentPID: 20,
            currentWindowID: 200
        )
        #expect(same)
        #expect(!cursorOnOtherSpace)
    }

    @Test("different window id does not match")
    func differentWindowID() {
        let left = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Browser",
            windowID: 10
        )
        let right = FocusFingerprint(
            pid: 7,
            role: "AXTextArea",
            windowTitle: "Browser",
            windowID: 11
        )
        #expect(!left.matches(right))
    }
}

@Suite("FieldRepair")
struct FieldRepairTests {
    @Test("matching field needs no rewrite")
    func alreadyMatches() {
        let decision = FieldRepairDecision.decide(actual: "Hello", expected: "Hello")
        #expect(decision == .matches)
    }

    @Test("short suffix is repaired")
    func shortSuffix() {
        let decision = FieldRepairDecision.decide(actual: "Hellp", expected: "Hello")
        #expect(decision == .repair(deleteCount: 1, retype: "o"))
    }

    @Test("large AXValue drift is skipped")
    func tooLarge() {
        let actual = "Hi"
        let expected = String(repeating: "a", count: 623)
        let decision = FieldRepairDecision.decide(actual: actual, expected: expected)
        #expect(decision == .skipTooLarge(deleteCount: 2, retypeCount: 623))
    }
}

@Suite("KeyboardTopology")
struct KeyboardTopologyTests {
    @Test("home row fingers match touch-typing map")
    func homeRowFingers() {
        #expect(KeyboardTopology.topology(for: "a").finger == .pinky)
        #expect(KeyboardTopology.topology(for: "f").finger == .index)
        #expect(KeyboardTopology.topology(for: "j").finger == .index)
        #expect(KeyboardTopology.topology(for: " ").finger == .thumb)
    }

    @Test("a and j are opposite hands")
    func oppositeHands() {
        let leftHome = KeyboardTopology.topology(for: "a")
        let rightHome = KeyboardTopology.topology(for: "j")
        #expect(leftHome.hand != rightHome.hand)
    }
}
