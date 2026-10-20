export default function Feedback({ message, variant = "danger" }) {
    return message ? <div className={`alert alert-${variant} mt-3`} role={variant === "danger" ? "alert" : "status"}>{message}</div> : null;
}
