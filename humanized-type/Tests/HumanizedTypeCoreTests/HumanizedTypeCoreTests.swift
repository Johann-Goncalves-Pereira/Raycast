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
        var config = ChronometryConfig.default
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
