import { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';

export default function ActionMenu({ label = 'Más acciones', actions }) {
    const [anchor, setAnchor] = useState(null);
    return <><Button color="inherit" sx={{ textTransform: 'none' }} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event => setAnchor(event.currentTarget)}><FontAwesomeIcon icon={faEllipsis} aria-hidden="true" /><span className="ms-2">{label}</span></Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>{actions.map(action => <MenuItem key={action.label} onClick={() => { setAnchor(null); action.onClick(); }}>{action.label}</MenuItem>)}</Menu></>;
}
