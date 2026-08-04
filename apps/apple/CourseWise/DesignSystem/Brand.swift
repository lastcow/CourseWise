import SwiftUI
import UIKit

enum Brand {
    static let ink = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 248 / 255, green: 246 / 255, blue: 240 / 255, alpha: 1)
            : UIColor(red: 21 / 255, green: 20 / 255, blue: 15 / 255, alpha: 1)
    })
    static let paper = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 21 / 255, green: 20 / 255, blue: 15 / 255, alpha: 1)
            : UIColor(red: 251 / 255, green: 250 / 255, blue: 247 / 255, alpha: 1)
    })
    static let evergreen = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 113 / 255, green: 178 / 255, blue: 157 / 255, alpha: 1)
            : UIColor(red: 47 / 255, green: 93 / 255, blue: 80 / 255, alpha: 1)
    })
    static let warmSurface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 38 / 255, green: 36 / 255, blue: 30 / 255, alpha: 1)
            : UIColor(red: 244 / 255, green: 241 / 255, blue: 234 / 255, alpha: 1)
    })
}

struct BrandHeader: View {
    var compact = false

    var body: some View {
        HStack(spacing: 12) {
            Image("CourseWiseMark")
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 32 : 44, height: compact ? 32 : 44)
                .clipShape(RoundedRectangle(cornerRadius: compact ? 8 : 11, style: .continuous))
            Text("app.name")
                .font(compact ? .headline : .title2.weight(.semibold))
        }
        .accessibilityElement(children: .combine)
    }
}
