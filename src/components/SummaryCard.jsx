import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "../styles/components/SummaryCard.css";

function SummaryCard({
    title, value, icon, variant, columnClass = "col-12 col-sm-6 col-xl-3",
}) {
    return (
        <div className={`${columnClass} summary-column`}>
            <div className={`summary-card summary-${variant}`}>
                <div className="summary-icon">
                    <FontAwesomeIcon icon={icon} />
                </div>

                <div>
                    <h3>{value}</h3>
                    <p>{title}</p>
                </div>
            </div>
        </div>
    );
}

export default SummaryCard;
