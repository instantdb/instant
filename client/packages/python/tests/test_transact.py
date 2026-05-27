import copy
import uuid

import pytest

from instantdb import id, lookup
from instantdb._transact import _get_ops, _is_lookup, _parse_lookup, _TxBuilder


def test_id_is_uuid_string():
    uuid.UUID(id())


def test_lookup_wire_format():
    assert lookup("email", "alyssa@example.com") == 'lookup__email__"alyssa@example.com"'


def test_is_lookup():
    assert _is_lookup(lookup("email", "x@y.com"))
    assert not _is_lookup("regular-id")
    assert not _is_lookup(42)


def test_parse_lookup_handles_underscores_in_value():
    # `__` is the delimiter AND can appear inside JSON-encoded values.
    assert _parse_lookup(lookup("path", "a__b__c")) == ["path", "a__b__c"]


def test_tx_delete():
    chunk = _TxBuilder().goals["g-1"].delete()
    assert _get_ops(chunk) == [["delete", "goals", "g-1", None]]


def test_tx_update_with_opts():
    chunk = _TxBuilder().goals["g-1"].update({"title": "x"}, {"upsert": False})
    assert _get_ops(chunk) == [["update", "goals", "g-1", {"title": "x"}, {"upsert": False}]]


def test_tx_chunks_are_immutable():
    base = _TxBuilder().goals["g-1"].update({"title": "x"})
    extended = base.link({"todos": "t-1"})
    assert len(_get_ops(base)) == 1
    assert len(_get_ops(extended)) == 2


def test_tx_lookup_via_subscript_and_method():
    expected = [["update", "users", ["email", "a@b.com"], {"name": "A"}]]
    via_subscript = _TxBuilder().users[lookup("email", "a@b.com")].update({"name": "A"})
    via_method = _TxBuilder().users.lookup("email", "a@b.com").update({"name": "A"})
    assert _get_ops(via_subscript) == expected
    assert _get_ops(via_method) == expected


def test_tx_builder_blocks_underscore_attrs_so_deepcopy_works():
    # __getattr__ must raise AttributeError on dunder/underscore names so
    # copy.deepcopy / pickle / Jupyter rich-repr probes fall back to default
    # semantics rather than receiving a phantom _NamespaceBuilder.
    with pytest.raises(AttributeError):
        _ = _TxBuilder().__deepcopy__
    copy.deepcopy(_TxBuilder())
