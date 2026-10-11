"""Keep group commands usable when QQ supplies incomplete quoted-history metadata."""


def normalize_group_references(data: dict) -> dict:
    elements = data.get('msg_elements')
    if not isinstance(elements, list):
        return data
    valid = [element for element in elements if isinstance(element, dict)
             and 'message_type' in element and 'msg_idx' in element]
    if len(valid) == len(elements):
        return data
    return {**data, 'msg_elements': valid or None}


def install_qq_event_compat() -> None:
    from nonebot.adapters.qq import Adapter

    original = Adapter.payload_to_event

    def payload_to_event(payload):
        if payload.type == 'GROUP_AT_MESSAGE_CREATE' and isinstance(payload.data, dict):
            data = normalize_group_references(payload.data)
            if data is not payload.data:
                payload = payload.model_copy(update={'data': data})
        return original(payload)

    Adapter.payload_to_event = staticmethod(payload_to_event)
