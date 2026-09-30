"""Pure guard for a QR login requested from a public QQ group."""


def owns_zzz_uid(roles: object, expected_uid: str) -> bool:
    if not isinstance(roles, list) or not expected_uid:
        return False
    return any(
        isinstance(role, dict)
        and str(role.get("game_id")) == "8"
        and str(role.get("game_role_id")) == expected_uid
        for role in roles
    )
