import AppKit
import SwiftUI

/// A premium animated loader for the gateway setup page.
/// Concentric orbital rings with glowing dots and a breathing center icon.
struct BaxBotSetupLoader: View {
    var done: Bool
    var failed: Bool

    @State private var outerRotation: Double = 0
    @State private var middleRotation: Double = 0
    @State private var innerRotation: Double = 0
    @State private var breathe: CGFloat = 1.0
    @State private var pulseOpacity: CGFloat = 0.0
    @State private var dotScale: CGFloat = 1.0
    @State private var completionScale: CGFloat = 0.6

    private let accentGradient = AngularGradient(
        gradient: Gradient(colors: [
            Color.accentColor.opacity(0.1),
            Color.accentColor.opacity(0.6),
            Color.accentColor.opacity(0.9),
            Color.accentColor.opacity(0.6),
            Color.accentColor.opacity(0.1),
        ]),
        center: .center)

    private let subtleGradient = AngularGradient(
        gradient: Gradient(colors: [
            Color.accentColor.opacity(0.05),
            Color.accentColor.opacity(0.3),
            Color.accentColor.opacity(0.5),
            Color.accentColor.opacity(0.3),
            Color.accentColor.opacity(0.05),
        ]),
        center: .center)

    var body: some View {
        ZStack {
            // Ambient glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.accentColor.opacity(self.done ? 0.0 : 0.08 * self.breathe),
                            Color.clear,
                        ],
                        center: .center,
                        startRadius: 10,
                        endRadius: 90))
                .scaleEffect(1.3)

            if !self.done {
                // Outer ring
                Circle()
                    .stroke(Color.accentColor.opacity(0.06), lineWidth: 1)
                    .frame(width: 140, height: 140)

                Circle()
                    .trim(from: 0, to: 0.35)
                    .stroke(self.accentGradient, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .frame(width: 140, height: 140)
                    .rotationEffect(.degrees(self.outerRotation))

                // Outer dot
                OrbitalDot(color: Color.accentColor, size: 6)
                    .offset(x: 70)
                    .rotationEffect(.degrees(self.outerRotation))
                    .scaleEffect(self.dotScale)

                // Middle ring
                Circle()
                    .stroke(Color.accentColor.opacity(0.05), lineWidth: 1)
                    .frame(width: 100, height: 100)

                Circle()
                    .trim(from: 0, to: 0.4)
                    .stroke(self.subtleGradient, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: 100, height: 100)
                    .rotationEffect(.degrees(self.middleRotation))

                // Middle dot
                OrbitalDot(color: Color.accentColor.opacity(0.7), size: 4.5)
                    .offset(x: 50)
                    .rotationEffect(.degrees(self.middleRotation))
                    .scaleEffect(self.dotScale)

                // Inner ring
                Circle()
                    .trim(from: 0, to: 0.5)
                    .stroke(
                        Color.accentColor.opacity(0.15),
                        style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    .frame(width: 60, height: 60)
                    .rotationEffect(.degrees(self.innerRotation))

                // Inner dot
                OrbitalDot(color: Color.accentColor.opacity(0.5), size: 3)
                    .offset(x: 30)
                    .rotationEffect(.degrees(self.innerRotation))
                    .scaleEffect(self.dotScale)

                // Pulse ring
                Circle()
                    .stroke(Color.accentColor.opacity(self.pulseOpacity * 0.3), lineWidth: 1)
                    .frame(width: 140, height: 140)
                    .scaleEffect(1.0 + (1.0 - self.pulseOpacity) * 0.15)
            }

            // Center icon
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 44, height: 44)
                    .shadow(color: Color.accentColor.opacity(self.done ? 0.0 : 0.15), radius: 8)

                if self.done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.green)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    Image(nsImage: CritterIconRenderer.makeIcon(blink: 0))
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 24, height: 24)
                }
            }
            .scaleEffect(self.done ? self.completionScale : self.breathe)
        }
        .onAppear {
            guard !self.done else { return }
            // Orbital rotations at different speeds for visual depth
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                self.outerRotation = 360
            }
            withAnimation(.linear(duration: 4.5).repeatForever(autoreverses: false)) {
                self.middleRotation = -360
            }
            withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                self.innerRotation = 360
            }
            // Breathing center
            withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                self.breathe = 1.06
            }
            // Dot scale pulse
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                self.dotScale = 1.3
            }
            // Pulse ring
            withAnimation(.easeOut(duration: 2.5).repeatForever(autoreverses: false)) {
                self.pulseOpacity = 1.0
            }
        }
        .onChange(of: self.done) { _, isDone in
            if isDone {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                    self.completionScale = 1.0
                }
            }
        }
    }
}

/// A small glowing orbital dot.
private struct OrbitalDot: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        Circle()
            .fill(self.color)
            .frame(width: self.size, height: self.size)
            .shadow(color: self.color.opacity(0.6), radius: 4)
    }
}
