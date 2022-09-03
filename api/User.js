const express = require('express');
const router = express.Router();

// Modelo de usuario (user)
const User = require('./../models/User');

// modelo verificación de usuario
const UserVerification = require('./../models/UserVerification');

// modelo verificación de usuario
const PasswordReset = require('./../models/PasswordReset');

// email
const nodemailer = require("nodemailer");

// unique string
const {v4: uuidv4} = require("uuid");


// env
require("dotenv").config();

// password crypt
const bcrypt = require('bcrypt');

// path pagina verificación
const path = require("path");

// nodemailer
let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
})

transporter.verify((error, success) => {
    if(error) {
        console.log(error);
    } else {
        console.log("Listo para enviar correos");
        console.log(success);
    }
})

//Registrarse
router.post('/signup', (req, res) => {
    let { nombre, apellido, birthday, email, password } = req.body;
    nombre = nombre.trim();
    apellido = apellido.trim();
    birthday = birthday.trim();
    email = email.trim();
    password = password.trim();

    if (nombre == "" || apellido == "" || birthday == "" || email == "" || password == "") {
        res.json({
            status: "FAILED",
            message: "No se han llenado todos los campos"
        });
    } else if (!/^[a-zA-Z ]*$/.test(nombre)) {
        res.json({
            status: "FAILED",
            message: "Nombre introducido no válido"
        });
    } else if (!/^[a-zA-Z ]*$/.test(apellido)) {
        res.json({
            status: "FAILED",
            message: "Apellido introducido no válido"
        });
    } else if (!new Date(birthday).getTime()) {
        res.json({
            status: "FAILED",
            message: "La fecha de nacimiento introducida no es válida"
        });
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.json({
            status: "FAILED",
            message: "Correo electrónico introducido no válido"
        });
    } else if (password.length < 8) {
        res.json({
            status: "FAILED",
            message: "La contraseña introducida es muy corta"
        });
    } else {
        User.find({ email }).then(result => {
            if (result.length) { 
                res.json({
                    status: "FAILED", 
                    message: "El correo electrónico ingresado ya se encuentra registrado"
                });
            } else {
                //Crear nuevo usuario
                const saltRounds = 10;
                bcrypt.hash(password, saltRounds). then(hashedPassword => {
                    const newUser = new User ({
                        nombre,
                        apellido,
                        birthday,
                        email,
                        password: hashedPassword,
                        verifyEmail: false,
                    });

                    newUser.save().then(result => {
                        // verificar cuenta
                        sendVerificationEmail(result, res);
                    })
                    .catch(err => {
                        res.json({
                            status: "FAILED",
                            message: "Error mientras se creaba usuario nuevo",
                            data: result,
                        });
                    });
                })
                .catch(err => {
                    res.json({
                        status: "FAILED",
                        message: "Error mientras se aplicaba hash a la contraseña"
                    })
                })
            }
        }).catch(err => {
            console.log(err);
            res.json({
                status: "FAILED",
                message: "Error mientras se buscaba un usuario existente"
            });
        })
    }
});

// enviar verificacion
const sendVerificationEmail = ({_id, email}, res) => {
    // url 
    const currentUrl = "http://localhost:5000/"
    const uniqueString = uuidv4() + _id;

    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Verifica tu cuenta de correo electrónico",
        html: `<p>Verifica tu correo electrónico para complentar tu registro e iniciar sesión en tu cuenta.</p><p>El enlace <b>expira en 6 horas</b>.</p><p>Haz clic <a href=${currentUrl + "user/verify/" + _id + "/" + uniqueString}>aquí</a> para confirmar.</p>`
    };
    // hash uniquestring
    const saltRounds = 10;
    bcrypt.hash(uniqueString, saltRounds).then((hashedUniqueString) => {
        const newVerification = new UserVerification({
            userId: _id,
            uniqueString: hashedUniqueString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 21600000,
        });
        newVerification.save().then(() => {
            transporter
            .sendMail(mailOptions)
            .then(() => {
                // se manda la verificación
                res.json({
                    status: "PENDING",
                    message: "Se envió la verificación de correo electrónico",
                });
            })
            .catch((error) => {
                console.log(error);
                res.json({
                    status: "FAILED",
                    message: "Falló la verificación de correo electrónico",
                });
            })
        })
        .catch((error) => {
            console.log(error);
            res.json({
                status: "FAILED",
                message: "No se pudo guardar la información de verificación de correo",
            });
        })
    }).catch(() => {
        res.json({
            status: "FAILED",
            message: "Ocurrió un error mientras se hacía hash a los datos del correo",
        });
    })
};

// verificar correo
router.get("/verify/:userId/:uniqueString", (req, res) => {
    let { userId, uniqueString} = req.params;

    UserVerification
    .find({userId})
    .then((result) => {
        if (result.length > 0) {
            // existe verificación
            const { expiresAt } = result[0];
            const hashedUniqueString = result[0].uniqueString;

            // Verificar expiración
            if (expiresAt < Date.now()) {
                // expiró y se tiene q eliminar
                UserVerification
                .deleteOne({ userId })
                .then(result => {
                    User
                    .deleteOne({_id: userId})
                    .then(() => {
                        let message = "El enlace ha expirado. Por favor, registrate de nuevo.";
                        res.redirect(`/user/verified/error=true&message=${message}`);
                    })
                    .catch(error => {
                        let message = "Error al eliminar usuario con unique string";
                        res.redirect(`/user/verified/error=true&message=${message}`);
                    })
                })
                .catch((error) => {
                    let message = "Ocurrió un error al verificar la expiración de verificación";
                    res.redirect(`/user/verified/error=true&message=${message}`);
                })
            } else {
                // validar usuario
                // comparar hash
                bcrypt
                .compare(uniqueString, hashedUniqueString)
                .then(result => {
                    if (result) {
                        User.updateOne({_id: userId}, {verifyEmail: true})
                        .then(() => {
                            UserVerification
                            .deleteOne({userId})
                            .then(() => {
                                res.sendFile(path.join(__dirname, "./../views/verified.html"));
                            })
                            .catch(error => {
                                let message = "Se produjo un error mientras finalizaba la verificación.";
                                res.redirect(`/user/verified/error=true&message=${message}`);
                            })
                        })
                        .catch(error => {
                            let message = "Error al actualizar verificación";
                            res.redirect(`/user/verified/error=true&message=${message}`);
                        })
                        
                    } else {
                        let message = "Detalles de verificación incorrectos. Verificar bandeja de entrada.";
                        res.redirect(`/user/verified/error=true&message=${message}`);
                    }
                })
                .catch(error => {
                    let message = "Se produjo un error al comparar unique strings.";
                    res.redirect(`/user/verified/error=true&message=${message}`);
                })
            }

        } else {
            // no existe verificación
            let message = "No se encontró registro de cuenta o ya se encuentra verificada. Por favor, registrate o inicia sesión.";
            res.redirect(`/user/verified/error=true&message=${message}`);
        }
    })
    .catch((error) => {
        console.log(error);
        let message = "Se produjo un error al verificar el registro de verificación de usuario existente";
        res.redirect(`/user/verified/error=true&message=${message}`);
    })
});

// plantilla verificacion
router.get("/verified", (req, res) => {
    res.sendFile(path.join(__dirname, "./../views/verified.html"));

})

// Inicio de sesión
router.post('/signin', (req, res) => {
    let {email, password} = req.body;
    email = email.trim();
    password = password.trim();

    if (email == "" || password == "") {
        res.json({
            status: "FAILED",
            message: "Datos de inicio de sesión en blanco"
        });
    } else {
        User
        .find({email})
        .then(data => {
            if (data.length) {
                // checar si está verificado el usuario
                if (!data[0].verifyEmail) {
                    res.json({
                        status: "FAILED",
                        message: "El correo electrónico no ha sido verificado aún. Comprobar bandeja de entrada.",
                    });
                } else {
                    const hashedPassword = data[0].password;
                bcrypt.compare(password, hashedPassword).then(result => {
                if (result) {
                    res.json({
                        status: "SUCCESS",
                        message: "Inicio de sesión éxitoso",
                        data: data
                    });
                } else {
                    res.json({
                        status: "FAILED",
                        message: "Contraseña introducida inválida"
                    });
                }
            })
            .catch(err => {
                res.json({
                    status: "FAILED",
                    message: "Ocurrió un error mientras se comparaban contraseñas"
                });
            });
            }
            } else {
                res.json({
                    status: "FAILED",
                    message: "Datos de inicio de sesión incorrectos"
                });
            }
        })
        .catch(err => {
            res.json({
                status: "FAILED",
                message: "Ocurrió un error mientras se verificaba la existencia del usuario"
            });
        })
    }
})

// Resetear contrasena
router.post("/requestPasswordReset", (req, res) => {
    const { email, redirectUrl } = req.body;

    // Verificar si está registrado
    User
    .find({email})
    .then((data) => {
        if (data.length) {
            // usuario existe

            // comprobar si está verificado
            if (!data[0].verifyEmail) {
                res.json({
                    status: "FAILED",
                    message: "El correo electrónico no se encuentra verificado aún",
                });
            } else {
                // email reset password
                sendResetEmail(data[0], redirectUrl, res);
            }
        } else {
            res.json({
                status: "FAILED",
                message: "No existe una cuenta asosiada al correo electrónico introducido"
            });
        }
    })
    .catch(error => {
        console.log(error);
        res.json({
            status: "FAILED",
            message: "Ocurrió un error mientras se verificaba la existencia del usuario"
        });
    })
})

// enviar correo de resetear pw
const sendResetEmail = ({_id, email}, redirectUrl, res) => {
    const resetString = uuidv4() + _id;
    PasswordReset
    .deleteMany({ userId: _id})
    .then(result => {
        // con éxito y mandar email
        const mailOptions = {
            from: process.env.AUTH_EMAIL,
            to: email,
            subject: "Restablecer contraseña",
            html: `<p>Has solicitado el restablecimiento de contraseña.</p> <p>Usa el siguiente enlace para reestablecerla</p> <p>El enlace <b>expira en 60 minutos</b>.</p><p>Haz clic <a href=${redirectUrl + "/" + _id + "/" + resetString}>aquí</a> para restablecer.</p>`
        };

        // hash reset
        const saltRounds = 10;
        bcrypt
        .hash(resetString, saltRounds)
        .then(hashedResetString => {
            // valores a pwr
            const newPasswordReset = new PasswordReset({
                userId: _id,
                resetString: hashedResetString,
                createdAt: Date.now(),
                expiresAt: Date.now() + 3600000,
            });

            newPasswordReset
            .save()
            .then(() => {
                transporter
                .sendMail(mailOptions)
                .then(() => {
                    // correo y guardar
                    res.json({
                        status: "PENDING",
                        message: "Se envió el correo para el restablecimiento de contraseña"
                    });
                })
                .catch(error => {
                    console.log(error);
                    res.json({
                        status: "FAILED",
                        message: "No se pudo enviar correo de restablecimiento de contraseña"
                    });
                })
            })
            .catch(error => {
                console.log(error);
                res.json({
                    status: "FAILED",
                    message: "No se pudo guardar los datos de restablecimiento de contraseña"
                });
            })
        })
        .catch(error => {
            console.log(error);
            res.json({
                status: "FAILED",
                message: "Ocurrió un error mientras se realizaba el hash a los datos de restablecimiento de contraseña"
            });
        })

    })
    .catch(error => {
        console.log(error);
        res.json({
            status: "FAILED",
            message: "Ocurrió un error al intentar borrrar los  datos de restablecimiento de contraseña existentes"
        });
    })
}

router.post("/resetPassword", (req, res) => {
    let { userId, resetString, newPassword } = req.body;

    PasswordReset
    .find({userId})
    .then(result => {
        if (result.length > 0) {
            const {expiresAt} = result[0];
            const hashedResetString = result[0].resetString;

            if (expiresAt < Date.now()){
                PasswordReset
                .deleteOne({userId})
                .then(() => {
                    res.json({
                        status: "FAILED",
                        message: "El enlace para restablecer contraseña ha expirado."
                    });
                })
                .catch(error => {
                    console.log(error);
                    res.json({
                        status: "FAILED",
                        message: "Error al borrar el registro de restablecimiento de contraseña."
                    });
                })

            } else {
                bcrypt
                .compare(resetString, hashedResetString)
                .then((result) => {
                    if (result) {
                        const saltRounds = 10;
                        bcrypt
                        .hash(newPassword, saltRounds)
                        .then(hashedNewPassword => {
                            // actualizar pw
                            User
                            .updateOne({_id: userId}, {password: hashedNewPassword})
                            .then(() => {
                                // actualización completa. eliminar rpwr
                                PasswordReset
                                .deleteOne({userId})
                                .then(() => {
                                    res.json({
                                        status: "SUCCESS",
                                        message: "Se restableció la contraseña con éxito."
                                    });
                                })
                                .catch(error => {
                                    console.log(error);
                                    res.json({
                                        status: "FAILED",
                                        message: "Se produjo un error al restablecer contraseña."
                                    });
                                })

                            })
                            .catch(error => {
                                console.log(error);
                                res.json({
                                    status: "FAILED",
                                    message: "Error al actualizar contraseña de usuario."
                                });
                            })
                        })
                        .catch(error => {
                            console.log(error);
                            res.json({
                                status: "FAILED",
                                message: "Se produjo un errormientras se realizaba hash a la contraseña nueva."
                            });
                        })

                    } else {
                        res.json({
                            status: "FAILED",
                            message: "Detalles de restablecimiento de contraseña no válidos."
                        });
                    }

                })
                .catch(error => {
                    res.json({
                        status: "FAILED",
                        message: "Error al comparar cadena de restablecimiento de contraseña."
                    });
                })
            }

        } else {
            res.json({
                status: "FAILED",
                message: "Solicitud de restablecimiento de contraseña no encontrada."
            });
        }
    })
    .catch(error => {
        console.log(error);
        res.json({
            status: "FAILED",
            message: "Ocurrió un error al intentar buscar los  datos de restablecimiento de contraseña existentes"
        });
    })
})


module.exports = router;