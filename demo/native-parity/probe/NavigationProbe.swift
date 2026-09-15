import UIKit

/// Independent UIKit reference; no production/native integration API.
final class NavigationProbe: UINavigationController {
    init() {
        super.init(rootViewController: ProbeListController(style: .insetGrouped))
        navigationBar.prefersLargeTitles = true
        view.accessibilityIdentifier = "NativeNavigation"
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

private final class ProbeListController: UITableViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Home"
        navigationItem.largeTitleDisplayMode = .always
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Next", style: .plain, target: self, action: #selector(pushDetail))
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
    }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { 8 }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        var configuration = cell.defaultContentConfiguration()
        configuration.text = "Row \(indexPath.row + 1)"
        cell.contentConfiguration = configuration
        return cell
    }
    @objc private func pushDetail() { navigationController?.pushViewController(DetailController(), animated: true) }
}

private final class DetailController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Detail"
        navigationItem.largeTitleDisplayMode = .never
        view.backgroundColor = .systemGroupedBackground
        let label = UILabel()
        label.text = "Detail content"
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }
}
