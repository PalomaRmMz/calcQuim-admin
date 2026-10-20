import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
export default function PrimaryAction({ children, onClick }) {
    return <button type="button" className="btn btn-primary" onClick={onClick}><FontAwesomeIcon icon={faPlus} className="me-2" />{children}</button>;
}
