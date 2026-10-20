import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import "../styles/layout/Header.css";

function Header({ title, subtitle, onOpenMenu }) {
    return (
        <header className="top-header">
            <button
                type="button"
                className="mobile-menu-button"
                onClick={onOpenMenu}
                aria-label="Abrir menú"
            >
                <FontAwesomeIcon icon={faBars} />
            </button>

            <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
            </div>
        </header>
    );
}

export default Header;