"""Activity tracking panel - user movements through the app."""

from flask import render_template

from admin.panels import Panel, register_panel


def create_activity_panel():
    """Create and register the activity panel."""

    def view():
        return render_template("admin/activity.html")

    panel = Panel(
        id="activity",
        name="Activity",
        route="/activity",
        view_func=view,
        icon="",
        order=15,
    )
    register_panel(panel)
    return panel
