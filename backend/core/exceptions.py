from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler, set_rollback


class BusinessError(Exception):
    """A rule of the business was violated (e.g. paying more than is due).

    Raised by the service layer; surfaced to API clients as HTTP 400.
    """

    def __init__(self, message: str, code: str = "business_rule"):
        super().__init__(message)
        self.message = message
        self.code = code


def api_exception_handler(exc, context):
    if isinstance(exc, BusinessError):
        set_rollback()
        return Response({"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(detail=getattr(exc, "message_dict", None) or exc.messages)
    if isinstance(exc, ProtectedError):
        set_rollback()
        return Response(
            {"detail": "This record is used by other records and cannot be deleted.", "code": "protected"},
            status=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, IntegrityError):
        set_rollback()
        return Response(
            {"detail": "The database rejected this change because it would break a data rule.", "code": "integrity"},
            status=status.HTTP_409_CONFLICT,
        )
    return exception_handler(exc, context)
