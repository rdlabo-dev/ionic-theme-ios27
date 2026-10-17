import Combine
import SwiftUI
import UIKit

@available(iOS 26.0, *)
final class ShellVerticalSearchModel: ObservableObject {
    @Published private(set) var configuration: ShellSearch
    @Published var text: String
    @Published var presented: Bool
    @Published var focused: Bool
    private weak var railView: UIView?
    private let activate: (String) -> Void
    private let changed: (String, ShellSearchPhase, String, Bool, Int) -> Int
    private let inputDelegate = ShellSearchInputDelegate()
    private var editingSequence = 0
    private var valueVersion: Int

    init(_ configuration: ShellSearch, in railView: UIView,
         activate: @escaping (String) -> Void,
         changed: @escaping (String, ShellSearchPhase, String, Bool, Int) -> Int) {
        self.configuration = configuration
        self.railView = railView
        self.activate = activate
        self.changed = changed
        text = configuration.value
        presented = configuration.available && configuration.active
        focused = configuration.focused
        valueVersion = configuration.valueVersion
        inputDelegate.clear = { [weak self] in self?.emit(.clear) }
    }

    var ownsKeyboardChrome: Bool { presented && (focused || textField?.isFirstResponder == true) }

    private var textField: UISearchTextField? {
        func find(_ view: UIView) -> UISearchTextField? {
            guard !view.isHidden, view.alpha > 0.01 else { return nil }
            if let field = view as? UISearchTextField { return field }
            for child in view.subviews {
                if let field = find(child) { return field }
            }
            return nil
        }
        return railView.flatMap(find)
    }

    func apply(_ next: ShellSearch) {
        let previous = configuration
        configuration = next
        if next.valueVersion != valueVersion || next.editSequence >= editingSequence {
            valueVersion = next.valueVersion
            text = next.value
        }
        presented = next.available && next.active
        // The first Web acknowledgement still carries the old focus state.
        if !next.active { focused = false }
        else if previous.focused != next.focused { focused = next.focused }
    }

    func input(_ value: String) {
        text = value
        emit(.input)
    }

    func present(_ value: Bool) {
        presented = value
        if value != configuration.active {
            activate(value ? configuration.trigger.id : configuration.closeId)
        }
    }

    func focus(_ value: Bool) {
        focused = value
        emit(value ? .focus : .blur)
    }

    func commit() { emit(.commit) }

    func configureField() {
        guard let field = textField else { return }
        field.accessibilityIdentifier = configuration.id
        field.accessibilityLabel = configuration.field.accessibilityLabel
        field.isEnabled = !configuration.disabled
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.clearButtonMode = .always
        if field.delegate !== inputDelegate {
            inputDelegate.original = field.delegate
            field.delegate = inputDelegate
        }
    }

    private func emit(_ phase: ShellSearchPhase) {
        editingSequence = changed(configuration.id, phase, text,
                                  textField?.markedTextRange != nil, valueVersion)
    }
}

@available(iOS 26.0, *)
struct ShellVerticalSearchModifier: ViewModifier {
    @ObservedObject var model: ShellVerticalSearchModel
    @FocusState private var focused: Bool

    @ViewBuilder func body(content: Content) -> some View {
        if model.configuration.available {
            content
                .searchable(text: Binding(get: { model.text }, set: model.input),
                            isPresented: Binding(get: { model.presented }, set: model.present),
                            placement: .toolbar, prompt: Text(model.configuration.placeholder))
                .searchToolbarBehavior(.minimize)
                .searchPresentationToolbarBehavior(.avoidHidingContent)
                .searchFocused($focused)
                .onSubmit(of: .search, model.commit)
                .onChange(of: focused) { _, value in model.focus(value) }
                .onChange(of: model.focused) { _, value in focused = value }
        } else { content }
    }
}
