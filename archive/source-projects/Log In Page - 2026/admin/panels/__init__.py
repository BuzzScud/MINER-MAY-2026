"""Panel registry for modular admin sections."""

ADMIN_PANELS = []


class Panel:
    """Base panel descriptor for admin sidebar and routing."""

    def __init__(
        self,
        id: str,
        name: str,
        route: str,
        view_func,
        icon: str = "",
        order: int = 100,
    ):
        self.id = id
        self.name = name
        self.route = route
        self.view_func = view_func
        self.icon = icon
        self.order = order

    def url(self, blueprint_name: str = "admin") -> str:
        return f"{blueprint_name}.{self.id}"


def register_panel(panel: Panel) -> None:
    """Register a panel for display in the admin sidebar."""
    ADMIN_PANELS.append(panel)
    ADMIN_PANELS.sort(key=lambda p: (p.order, p.name))
