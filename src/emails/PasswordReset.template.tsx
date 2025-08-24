// biome-ignore lint/correctness/noUnusedImports: react is needed
import React from "react";
import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Link,
	Preview,
	Section,
	Text,
	Tailwind,
	Img,
} from "@react-email/components";

const PasswordResetEmail = (props: {
	userFirstName?: string;
	resetLink?: string;
}) => {
	const {
		userFirstName = "Produtor",
		resetLink = "https://albieri.com/reset-password",
	} = props;

	const logoUrl =
		"https://assets.scarf.club/A0Pqd0NKJmzo_fv1rRaj0UGef75cVyF8L6onuON8Ow4/w:96/h:96/f:png/q:100/aHR0cHM6Ly9zY2FyZi1wdWJsaWMtYXNzZXRzLnMzLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tL2FsYmllcmkvZmF2aWNvbl81MTIucG5n";

	return (
		<Html lang="pt" dir="ltr">
			<Head />
			<Preview>
				Redefina sua senha do Albieri - Solicitação de redefinição
			</Preview>
			<Tailwind>
				<Body className="bg-gray-100 py-[40px] font-sans">
					<Container className="bg-white rounded-[8px] shadow-sm max-w-[600px] mx-auto">
						{/* Header */}
						<Section className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-t-[8px] px-[32px] py-[32px] text-center">
							<Img
								src={logoUrl}
								alt="Albieri"
								className="w-auto h-[40px] mx-auto"
							/>
						</Section>

						{/* Main Content */}
						<Section className="px-[32px] py-[32px]">
							<Heading className="text-gray-900 text-[24px] font-bold mb-[24px] mt-0">
								{userFirstName ? `Olá, ${userFirstName}!` : "Olá!"} 👋
							</Heading>

							<Text className="text-gray-700 text-[16px] leading-[24px] mb-[20px]">
								Recebemos uma solicitação para redefinir a senha da sua conta no{" "}
								<strong>Albieri</strong>.
							</Text>

							<Text className="text-gray-700 text-[16px] leading-[24px] mb-[28px]">
								Se você fez esta solicitação, clique no botão abaixo para criar
								uma nova senha. Este link é válido por <strong>24 horas</strong>
								.
							</Text>

							{/* CTA Button */}
							<Section className="text-center mb-[32px]">
								<Button
									href={resetLink}
									className="bg-emerald-600 text-white text-white px-[32px] py-[16px] rounded-[8px] text-[16px] font-semibold no-underline box-border"
								>
									Redefinir Minha Senha
								</Button>
							</Section>

							{/* Alternative Link */}
							<Text className="text-gray-600 text-[14px] leading-[20px] mb-[24px]">
								Se o botão não funcionar, copie e cole este link no seu
								navegador:
							</Text>

							<Text className="text-emerald-600 text-[14px] leading-[20px] mb-[32px] break-all">
								<Link href={resetLink} className="text-emerald-600 underline">
									{resetLink}
								</Link>
							</Text>

							{/* Security Notice */}
							<Section className="bg-amber-50 border-l-[4px] border-amber-400 px-[20px] py-[16px] rounded-r-[4px] mb-[24px]">
								<Text className="text-amber-800 text-[14px] leading-[20px] m-0 font-medium">
									⚠️ <strong>Importante:</strong> Se você não solicitou esta
									redefinição de senha, ignore este email. Sua conta permanecerá
									segura.
								</Text>
							</Section>

							<Text className="text-gray-600 text-[14px] leading-[20px]">
								Atenciosamente,
								<br />
								<strong>albieri.ai</strong>
							</Text>
						</Section>

						{/* Footer */}
						<Section className="bg-gray-50 px-[32px] py-[24px] rounded-b-[8px] border-t border-gray-200">
							<Text className="text-gray-500 text-[12px] leading-[16px] text-center m-0">
								© 2025 Albieri. Todos os direitos reservados.
							</Text>
							<Text className="text-gray-500 text-[12px] leading-[16px] text-center m-0 mt-[8px]">
								Avenida Brig Faria Lima, 1811, Conj 1120 - São Paulo, SP -
								Brasil
							</Text>
							<Text className="text-gray-500 text-[12px] leading-[16px] text-center m-0 mt-[12px]">
								{/*<Link
									href="https://albieri.com/unsubscribe"
									className="text-gray-500 underline"
								>
									Cancelar inscrição
								</Link>*/}
								<Link
									href="https://albieri.ai/termos-de-uso"
									className="text-gray-500 underline"
								>
									Termos de Uso
								</Link>
								{" | "}
								<Link
									href="https://albieri.ai/politica-de-privacidade"
									className="text-gray-500 underline"
								>
									Política de Privacidade
								</Link>
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

PasswordResetEmail.PreviewProps = {
	userFirstName: "Carlos",
	resetLink: "https://albieri.com/reset-password?token=abc123xyz",
};

export default PasswordResetEmail;
