# Ejemplos de cURL - Eventos Publicados por ReservasAirBack

Este documento contiene ejemplos de cURL para los eventos que el servicio **ReservasAirBack** publica al broker de eventos.

## Configuración del Broker

- **URL**: `http://34.172.179.60/events`
- **API Key**: `microservices-api-key-2024-secure`
- **Content-Type**: `application/json`

---

## 1. Evento: Reserva Creada

**Event Type**: `reservations.reservation.created`

**Descripción**: Se publica cuando se crea una nueva reserva exitosamente.

### cURL Example:

```bash
curl -X POST http://34.172.179.60/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: microservices-api-key-2024-secure" \
  -d '{
    "messageId": "msg-1730000000000",
    "eventType": "reservations.reservation.created",
    "schemaVersion": "1.0",
    "occurredAt": "2025-11-04T12:00:00.000Z",
    "producer": "reservations-service",
    "correlationId": "corr-1730000000000",
    "idempotencyKey": "reservation-123-1730000000000",
    "payload": "{\"reservationId\":\"123\",\"userId\":\"user-456\",\"flightId\":\"flight-789\",\"amount\":15000,\"currency\":\"ARS\",\"reservedAt\":\"2025-11-04T12:00:00.000Z\"}"
  }'
```

### Payload Schema:

```json
{
  "reservationId": "string",  // ID de la reserva
  "userId": "string",         // ID del usuario
  "flightId": "string",       // ID del vuelo
  "amount": number,           // Monto total
  "currency": "string",       // Moneda (ej: ARS, USD)
  "reservedAt": "string"      // Timestamp ISO 8601
}
```

---

## 2. Evento: Reserva Actualizada

**Event Type**: `reservations.reservation.updated`

**Descripción**: Se publica cuando cambia el estado de una reserva (ej: PENDING → PAID, PENDING → FAILED).

### cURL Example - Pago Confirmado (PAID):

```bash
curl -X POST http://34.172.179.60/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: microservices-api-key-2024-secure" \
  -d '{
    "messageId": "msg-1730000001000",
    "eventType": "reservations.reservation.updated",
    "schemaVersion": "1.0",
    "occurredAt": "2025-11-04T12:05:00.000Z",
    "producer": "reservations-service",
    "correlationId": "corr-1730000001000",
    "idempotencyKey": "reservation-updated-123-1730000001000",
    "payload": "{\"reservationId\":\"123\",\"newStatus\":\"PAID\",\"reservationDate\":\"2025-11-04T12:00:00.000Z\",\"flightDate\":\"2025-12-15\"}"
  }'
```

### cURL Example - Pago Fallido (FAILED):

```bash
curl -X POST http://34.172.179.60/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: microservices-api-key-2024-secure" \
  -d '{
    "messageId": "msg-1730000002000",
    "eventType": "reservations.reservation.updated",
    "schemaVersion": "1.0",
    "occurredAt": "2025-11-04T12:10:00.000Z",
    "producer": "reservations-service",
    "correlationId": "corr-1730000002000",
    "idempotencyKey": "reservation-updated-456-1730000002000",
    "payload": "{\"reservationId\":\"456\",\"newStatus\":\"FAILED\",\"reservationDate\":\"2025-11-04T12:00:00.000Z\",\"flightDate\":\"2025-12-20\"}"
  }'
```

### cURL Example - Reserva Cancelada (CANCELLED):

```bash
curl -X POST http://34.172.179.60/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: microservices-api-key-2024-secure" \
  -d '{
    "messageId": "msg-1730000003000",
    "eventType": "reservations.reservation.updated",
    "schemaVersion": "1.0",
    "occurredAt": "2025-11-04T12:15:00.000Z",
    "producer": "reservations-service",
    "correlationId": "corr-1730000003000",
    "idempotencyKey": "reservation-updated-789-1730000003000",
    "payload": "{\"reservationId\":\"789\",\"newStatus\":\"CANCELLED\",\"reservationDate\":\"2025-11-04T12:00:00.000Z\",\"flightDate\":\"2025-12-25\"}"
  }'
```

### Payload Schema:

```json
{
  "reservationId": "string",    // ID de la reserva
  "newStatus": "string",        // Nuevo estado: PAID, FAILED, CANCELLED
  "reservationDate": "string",  // Fecha de creación de la reserva (ISO 8601)
  "flightDate": "string"        // Fecha del vuelo (YYYY-MM-DD)
}
```

---

## Estados Posibles de Reserva

| Estado       | Descripción                                    | Cuándo se genera                          |
|--------------|------------------------------------------------|-------------------------------------------|
| `PENDING`    | Reserva creada, esperando confirmación de pago | Al crear la reserva                       |
| `PAID`       | Pago confirmado exitosamente                   | Cuando llega evento `payment.SUCCESS`     |
| `FAILED`     | Pago fallido                                   | Cuando llega evento `payment.FAILURE`     |
| `CANCELLED`  | Reserva cancelada (reembolso)                  | Cuando llega evento `payment.REFUND`      |

---

## Estructura General de Eventos

Todos los eventos siguen este esquema base:

```json
{
  "messageId": "string",        // ID único del mensaje (ej: msg-1730000000000)
  "eventType": "string",        // Tipo de evento (ej: reservations.reservation.created)
  "schemaVersion": "string",    // Versión del schema (actualmente "1.0")
  "occurredAt": "string",       // Timestamp ISO 8601 cuando ocurrió el evento
  "producer": "string",         // Servicio que produce el evento (reservations-service)
  "correlationId": "string",    // ID para correlacionar eventos relacionados
  "idempotencyKey": "string",   // Clave para evitar duplicados
  "payload": "string"           // JSON stringificado con los datos del evento
}
```

---

## Notas Importantes

1. **El `payload` es un JSON stringificado**, no un objeto JSON directo.
2. **Cada evento debe tener un `messageId` único** para evitar duplicados.
3. **El `idempotencyKey` debe ser único** para cada operación (incluye timestamp para garantizar unicidad).
4. **Las fechas deben estar en formato ISO 8601** (`YYYY-MM-DDTHH:mm:ss.sssZ`).
5. **El header `X-API-Key` es obligatorio** para autenticación con el broker.

---

## Testing con PowerShell

Si prefieres usar PowerShell en lugar de curl:

### Ejemplo PowerShell:

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = "microservices-api-key-2024-secure"
}

$body = @{
    messageId = "msg-1730000000000"
    eventType = "reservations.reservation.created"
    schemaVersion = "1.0"
    occurredAt = "2025-11-04T12:00:00.000Z"
    producer = "reservations-service"
    correlationId = "corr-1730000000000"
    idempotencyKey = "reservation-123-1730000000000"
    payload = '{"reservationId":"123","userId":"user-456","flightId":"flight-789","amount":15000,"currency":"ARS","reservedAt":"2025-11-04T12:00:00.000Z"}'
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://34.172.179.60/events" -Method Post -Headers $headers -Body $body
```

---

## Contacto

Para más información sobre los eventos del sistema, consultar la documentación de arquitectura de eventos o contactar al equipo de desarrollo.
