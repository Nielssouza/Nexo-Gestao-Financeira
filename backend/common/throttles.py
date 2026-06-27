from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginThrottle(AnonRateThrottle):
    """10 login attempts per minute per IP."""
    scope = "login"


class CnpjLookupThrottle(UserRateThrottle):
    """60 CNPJ lookups per hour per user."""
    scope = "cnpj_lookup"


class NfseEmitThrottle(UserRateThrottle):
    """10 NFSe emission attempts per hour per user."""
    scope = "nfse_emit"


class CepLookupThrottle(UserRateThrottle):
    """60 CEP lookups per hour per user."""
    scope = "cep_lookup"
