import AppKit

/// Draws the BaxBot robot character as an 18pt menu bar template icon.
///
/// The robot has: rounded body, two antennae with ball tips, round eyes,
/// a belly panel, stubby arms, and two legs.  All features are drawn into
/// a 36×36 px backing store (2× Retina) and returned as a template image.
enum CritterIconRenderer {
    private static let size = NSSize(width: 18, height: 18)

    struct Badge {
        let symbolName: String
        let prominence: IconState.BadgeProminence
    }

    private struct Canvas {
        let w: CGFloat
        let h: CGFloat
        let stepX: CGFloat
        let stepY: CGFloat
        let snapX: (CGFloat) -> CGFloat
        let snapY: (CGFloat) -> CGFloat
        let context: CGContext
    }

    // MARK: - Robot Geometry

    private struct Geometry {
        let bodyRect: CGRect
        let bodyCorner: CGFloat

        let leftStalkRect: CGRect
        let rightStalkRect: CGRect
        let stalkCorner: CGFloat
        let leftTipCenter: CGPoint
        let rightTipCenter: CGPoint
        let tipRadius: CGFloat

        let leftArmRect: CGRect
        let rightArmRect: CGRect
        let armCorner: CGFloat

        let leftLegRect: CGRect
        let rightLegRect: CGRect
        let legCorner: CGFloat

        let leftEyeCenter: CGPoint
        let rightEyeCenter: CGPoint
        let eyeRadius: CGFloat

        let bellyRect: CGRect
        let bellyCorner: CGFloat

        init(canvas: Canvas, legWiggle: CGFloat, earWiggle: CGFloat, earScale: CGFloat) {
            let w = canvas.w
            let h = canvas.h
            let snapX = canvas.snapX
            let snapY = canvas.snapY
            let cx = snapX(w / 2)

            // --- Body: chunky rounded rectangle ---
            let bodyW = snapX(w * 0.66)
            let bodyH = snapY(h * 0.52)
            let bodyX = snapX(cx - bodyW / 2)
            let bodyY = snapY(h * 0.14)
            self.bodyRect = CGRect(x: bodyX, y: bodyY, width: bodyW, height: bodyH)
            self.bodyCorner = snapX(w * 0.13)

            // --- Antenna stalks ---
            let stalkW = snapX(max(canvas.stepX, w * 0.056))
            let stalkH = snapY(h * 0.14)
            let antennaSpread = snapX(bodyW * 0.28)
            let stalkBaseY = snapY(bodyY + bodyH - canvas.stepY)
            let lsx = snapX(cx - antennaSpread - stalkW / 2 + earWiggle * 0.35)
            let rsx = snapX(cx + antennaSpread - stalkW / 2 - earWiggle * 0.35)
            self.leftStalkRect = CGRect(x: lsx, y: stalkBaseY, width: stalkW, height: stalkH)
            self.rightStalkRect = CGRect(x: rsx, y: stalkBaseY, width: stalkW, height: stalkH)
            self.stalkCorner = snapX(stalkW * 0.3)

            // --- Antenna tips (ball ends) ---
            let tr = snapX(w * 0.07 * max(earScale, 0.85))
            self.tipRadius = tr
            self.leftTipCenter = CGPoint(
                x: snapX(lsx + stalkW / 2 + earWiggle * 0.2),
                y: snapY(stalkBaseY + stalkH + tr * 0.55))
            self.rightTipCenter = CGPoint(
                x: snapX(rsx + stalkW / 2 - earWiggle * 0.2),
                y: snapY(stalkBaseY + stalkH + tr * 0.55))

            // --- Arms (stubby nubs) ---
            let armW = snapX(w * 0.09)
            let armH = snapY(bodyH * 0.3)
            let armY = snapY(bodyY + bodyH * 0.28)
            self.leftArmRect = CGRect(
                x: snapX(bodyX - armW * 0.5), y: armY, width: armW, height: armH)
            self.rightArmRect = CGRect(
                x: snapX(bodyX + bodyW - armW * 0.5), y: armY, width: armW, height: armH)
            self.armCorner = snapX(armW * 0.4)

            // --- Legs (two, with walk animation) ---
            let legW = snapX(w * 0.12)
            let legH = snapY(h * 0.14)
            let legSpread = snapX(bodyW * 0.14)
            let lift = snapY(legH * 0.32 * legWiggle)
            self.leftLegRect = CGRect(
                x: snapX(cx - legSpread - legW),
                y: snapY(bodyY - legH * 0.55 + lift),
                width: legW,
                height: snapY(legH * (1 - 0.1 * legWiggle)))
            self.rightLegRect = CGRect(
                x: snapX(cx + legSpread),
                y: snapY(bodyY - legH * 0.55),
                width: legW,
                height: legH)
            self.legCorner = snapX(legW * 0.35)

            // --- Eyes (round, knocked out) ---
            let eyeR = snapX(bodyW * 0.12)
            let eyeY = snapY(bodyY + bodyH * 0.63)
            let eyeSpread = snapX(bodyW * 0.21)
            self.leftEyeCenter = CGPoint(x: snapX(cx - eyeSpread), y: eyeY)
            self.rightEyeCenter = CGPoint(x: snapX(cx + eyeSpread), y: eyeY)
            self.eyeRadius = eyeR

            // --- Belly panel (small square, knocked out) ---
            let bellyW = snapX(bodyW * 0.24)
            let bellyH = snapY(bodyH * 0.16)
            self.bellyRect = CGRect(
                x: snapX(cx - bellyW / 2),
                y: snapY(bodyY + bodyH * 0.17),
                width: bellyW, height: bellyH)
            self.bellyCorner = snapX(bellyW * 0.14)
        }
    }

    private struct FaceOptions {
        let blink: CGFloat
        let earHoles: Bool
        let earScale: CGFloat
        let eyesClosedLines: Bool
    }

    // MARK: - Public API

    static func makeIcon(
        blink: CGFloat,
        legWiggle: CGFloat = 0,
        earWiggle: CGFloat = 0,
        earScale: CGFloat = 1,
        earHoles: Bool = false,
        eyesClosedLines: Bool = false,
        badge: Badge? = nil) -> NSImage
    {
        guard let rep = self.makeBitmapRep() else {
            return NSImage(size: self.size)
        }
        rep.size = self.size

        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }

        guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
            return NSImage(size: self.size)
        }
        NSGraphicsContext.current = context
        context.imageInterpolation = .none
        context.cgContext.setShouldAntialias(true)

        let canvas = self.makeCanvas(for: rep, context: context)
        let geometry = Geometry(
            canvas: canvas, legWiggle: legWiggle,
            earWiggle: earWiggle, earScale: earScale)

        self.drawBody(in: canvas, geometry: geometry)
        let face = FaceOptions(
            blink: blink,
            earHoles: earHoles,
            earScale: earScale,
            eyesClosedLines: eyesClosedLines)
        self.drawFace(in: canvas, geometry: geometry, options: face)

        if let badge {
            self.drawBadge(badge, canvas: canvas)
        }

        let image = NSImage(size: size)
        image.addRepresentation(rep)
        image.isTemplate = true
        return image
    }

    // MARK: - Bitmap setup

    private static func makeBitmapRep() -> NSBitmapImageRep? {
        let pixelsWide = 36
        let pixelsHigh = 36
        return NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelsWide,
            pixelsHigh: pixelsHigh,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bitmapFormat: [],
            bytesPerRow: 0,
            bitsPerPixel: 0)
    }

    private static func makeCanvas(for rep: NSBitmapImageRep, context: NSGraphicsContext) -> Canvas {
        let stepX = self.size.width / max(CGFloat(rep.pixelsWide), 1)
        let stepY = self.size.height / max(CGFloat(rep.pixelsHigh), 1)
        let snapX: (CGFloat) -> CGFloat = { ($0 / stepX).rounded() * stepX }
        let snapY: (CGFloat) -> CGFloat = { ($0 / stepY).rounded() * stepY }

        let w = snapX(size.width)
        let h = snapY(size.height)

        return Canvas(
            w: w, h: h,
            stepX: stepX, stepY: stepY,
            snapX: snapX, snapY: snapY,
            context: context.cgContext)
    }

    // MARK: - Drawing: silhouette

    private static func drawBody(in canvas: Canvas, geometry: Geometry) {
        canvas.context.setFillColor(NSColor.labelColor.cgColor)

        // Body
        canvas.context.addPath(CGPath(
            roundedRect: geometry.bodyRect,
            cornerWidth: geometry.bodyCorner,
            cornerHeight: geometry.bodyCorner,
            transform: nil))

        // Antenna stalks
        canvas.context.addPath(CGPath(
            roundedRect: geometry.leftStalkRect,
            cornerWidth: geometry.stalkCorner,
            cornerHeight: geometry.stalkCorner,
            transform: nil))
        canvas.context.addPath(CGPath(
            roundedRect: geometry.rightStalkRect,
            cornerWidth: geometry.stalkCorner,
            cornerHeight: geometry.stalkCorner,
            transform: nil))

        // Antenna tips (circles)
        let tr = geometry.tipRadius
        canvas.context.addEllipse(in: CGRect(
            x: geometry.leftTipCenter.x - tr,
            y: geometry.leftTipCenter.y - tr,
            width: tr * 2, height: tr * 2))
        canvas.context.addEllipse(in: CGRect(
            x: geometry.rightTipCenter.x - tr,
            y: geometry.rightTipCenter.y - tr,
            width: tr * 2, height: tr * 2))

        // Arms
        canvas.context.addPath(CGPath(
            roundedRect: geometry.leftArmRect,
            cornerWidth: geometry.armCorner,
            cornerHeight: geometry.armCorner,
            transform: nil))
        canvas.context.addPath(CGPath(
            roundedRect: geometry.rightArmRect,
            cornerWidth: geometry.armCorner,
            cornerHeight: geometry.armCorner,
            transform: nil))

        // Legs
        canvas.context.addPath(CGPath(
            roundedRect: geometry.leftLegRect,
            cornerWidth: geometry.legCorner,
            cornerHeight: geometry.legCorner,
            transform: nil))
        canvas.context.addPath(CGPath(
            roundedRect: geometry.rightLegRect,
            cornerWidth: geometry.legCorner,
            cornerHeight: geometry.legCorner,
            transform: nil))

        canvas.context.fillPath()
    }

    // MARK: - Drawing: face (knockout)

    private static func drawFace(
        in canvas: Canvas,
        geometry: Geometry,
        options: FaceOptions)
    {
        canvas.context.saveGState()
        canvas.context.setBlendMode(.clear)

        // Antenna tip holes (active when earBoostActive)
        if options.earHoles || options.earScale > 1.05 {
            let holeR = canvas.snapX(geometry.tipRadius * 0.48)
            canvas.context.addEllipse(in: CGRect(
                x: geometry.leftTipCenter.x - holeR,
                y: geometry.leftTipCenter.y - holeR,
                width: holeR * 2, height: holeR * 2))
            canvas.context.addEllipse(in: CGRect(
                x: geometry.rightTipCenter.x - holeR,
                y: geometry.rightTipCenter.y - holeR,
                width: holeR * 2, height: holeR * 2))
        }

        // Eyes
        if options.eyesClosedLines {
            // Sleeping: thin horizontal bars
            let lineW = canvas.snapX(geometry.eyeRadius * 1.8)
            let lineH = canvas.snapY(max(canvas.stepY, geometry.bodyRect.height * 0.05))
            let corner = canvas.snapX(lineH * 0.5)
            let leftRect = CGRect(
                x: canvas.snapX(geometry.leftEyeCenter.x - lineW / 2),
                y: canvas.snapY(geometry.leftEyeCenter.y - lineH / 2),
                width: lineW, height: lineH)
            let rightRect = CGRect(
                x: canvas.snapX(geometry.rightEyeCenter.x - lineW / 2),
                y: canvas.snapY(geometry.rightEyeCenter.y - lineH / 2),
                width: lineW, height: lineH)
            canvas.context.addPath(CGPath(
                roundedRect: leftRect, cornerWidth: corner,
                cornerHeight: corner, transform: nil))
            canvas.context.addPath(CGPath(
                roundedRect: rightRect, cornerWidth: corner,
                cornerHeight: corner, transform: nil))
        } else {
            // Normal / blinking: circles that squash vertically during blink
            let r = geometry.eyeRadius
            let eyeOpen = max(0.08, 1 - options.blink)
            let eyeH = r * eyeOpen

            canvas.context.addEllipse(in: CGRect(
                x: geometry.leftEyeCenter.x - r,
                y: geometry.leftEyeCenter.y - eyeH,
                width: r * 2, height: eyeH * 2))
            canvas.context.addEllipse(in: CGRect(
                x: geometry.rightEyeCenter.x - r,
                y: geometry.rightEyeCenter.y - eyeH,
                width: r * 2, height: eyeH * 2))
        }

        // Belly panel
        canvas.context.addPath(CGPath(
            roundedRect: geometry.bellyRect,
            cornerWidth: geometry.bellyCorner,
            cornerHeight: geometry.bellyCorner,
            transform: nil))

        canvas.context.fillPath()
        canvas.context.restoreGState()
    }

    // MARK: - Drawing: badge overlay

    private static func drawBadge(_ badge: Badge, canvas: Canvas) {
        let strength: CGFloat = switch badge.prominence {
        case .primary: 1.0
        case .secondary: 0.58
        case .overridden: 0.85
        }

        let diameter = canvas.snapX(canvas.w * 0.52 * (0.92 + 0.08 * strength))
        let margin = canvas.snapX(max(0.45, canvas.w * 0.03))
        let rect = CGRect(
            x: canvas.snapX(canvas.w - diameter - margin),
            y: canvas.snapY(margin),
            width: diameter,
            height: diameter)

        canvas.context.saveGState()
        canvas.context.setShouldAntialias(true)

        // Clear underlying pixels so badge stays readable.
        canvas.context.saveGState()
        canvas.context.setBlendMode(.clear)
        canvas.context.addEllipse(in: rect.insetBy(dx: -1.0, dy: -1.0))
        canvas.context.fillPath()
        canvas.context.restoreGState()

        let fillAlpha: CGFloat = min(1.0, 0.36 + 0.24 * strength)
        let strokeAlpha: CGFloat = min(1.0, 0.78 + 0.22 * strength)

        canvas.context.setFillColor(NSColor.labelColor.withAlphaComponent(fillAlpha).cgColor)
        canvas.context.addEllipse(in: rect)
        canvas.context.fillPath()

        canvas.context.setStrokeColor(NSColor.labelColor.withAlphaComponent(strokeAlpha).cgColor)
        canvas.context.setLineWidth(max(1.25, canvas.snapX(canvas.w * 0.075)))
        canvas.context.strokeEllipse(in: rect.insetBy(dx: 0.45, dy: 0.45))

        if let base = NSImage(systemSymbolName: badge.symbolName, accessibilityDescription: nil) {
            let pointSize = max(7.0, diameter * 0.82)
            let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .black)
            let symbol = base.withSymbolConfiguration(config) ?? base
            symbol.isTemplate = true

            let symbolRect = rect.insetBy(dx: diameter * 0.17, dy: diameter * 0.17)
            canvas.context.saveGState()
            canvas.context.setBlendMode(.clear)
            symbol.draw(
                in: symbolRect,
                from: .zero,
                operation: .sourceOver,
                fraction: 1,
                respectFlipped: true,
                hints: nil)
            canvas.context.restoreGState()
        }

        canvas.context.restoreGState()
    }
}
