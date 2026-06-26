from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginThrottle(AnonRateThrottle):
    """10 tentativas de login por minuto por IP (espelho de ratelimit ip 10/m no SSR)."""
    scope = "login"


class CnpjLookupThrottle(UserRateThrottle):
    """60 consultas de CNPJ por hora por usuário (espelho de ratelimit user 60/h no SSR)."""
    scope = "cnpj_lookup"


class NfseEmitThrottle(UserRateThrottle):
    """10 emissões NFSe por hora por usuário (espelho de ratelimit user 10/h no SSR)."""
    scope = "nfse_emit"


class CepLookupThrottle(UserRateThrottle):
    """60 consultas de CEP por hora por usuário (espelho de ratelimit user 60/h no SSR)."""
    scope = "cep_lookup"
