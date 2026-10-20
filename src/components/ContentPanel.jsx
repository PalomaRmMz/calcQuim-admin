import "../styles/components/ContentPanel.css";

function ContentPanel({ title, subtitle, action, children }) {
    return (
        <section className="content-panel">
            <div className="content-panel-header">
                <div>
                    <h3>{title}</h3>
                    {subtitle && <p>{subtitle}</p>}
                </div>

                {action && <div>{action}</div>}
            </div>

            {children}
        </section>
    );
}

export default ContentPanel;