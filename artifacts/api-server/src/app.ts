import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { corsOptions, securityHeaders } from "./middlewares/security";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

const app: Express = express();

// Ters vekil (Vercel) arkasında doğru istemci IP'si ve protokolü için gerekli.
// İstek sınırlayıcı ve güvenli çerezler bu bilgiye dayanır.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(cookieParser());
// Sipariş ve fiyat istekleri küçük JSON gövdeleridir; büyük gövdeler reddedilir.
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);
// Vercel'in sunucusuz fonksiyonu isteği "/api" öneki olmadan iletirse de
// yönlendirme çalışsın diye aynı yönlendirici kök yola da bağlanır.
app.use(router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
