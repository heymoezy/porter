import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { fastifyZodOpenApiPlugin, serializerCompiler, validatorCompiler } from 'fastify-zod-openapi';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

async function openapiPlugin(fastify: FastifyInstance) {
  // Register Zod-OpenAPI integration — MUST happen before routes
  await fastify.register(fastifyZodOpenApiPlugin);
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Register Swagger spec generation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Porter API',
        description: 'Porter AI orchestration platform API',
        version: '2.0.0',
      },
      servers: [
        { url: '/api/v1', description: 'V1 API' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'porter_session',
          },
        },
      },
    },
  });

  // Register Swagger UI at /api/v1/docs (optional, helpful for development)
  await fastify.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
  });
}

export default fp(openapiPlugin, { name: 'porter-openapi' });
