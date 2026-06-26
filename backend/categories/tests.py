from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from categories.models import Category


class CategoryViewTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="category-user",
            email="category-user@example.com",
            password="secret123",
        )
        self.client.force_login(self.user)

    def test_create_category_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("categories:create"),
            {
                "name": "Mercado",
                "category_type": Category.CategoryType.EXPENSE,
            },
        )

        self.assertRedirects(response, reverse("categories:list"))
        category = Category.objects.get(name="Mercado")
        self.assertEqual(category.user, self.user)
        self.assertIsNotNone(category.tenant)


class CategoryApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="category-api-user",
            email="category-api-user@example.com",
            password="secret123",
        )
        self.other_user = user_model.objects.create_user(
            username="category-api-other",
            email="category-api-other@example.com",
            password="secret123",
        )
        self.tenant = self.user.tenant_memberships.get().tenant
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_category_api_create_assigns_user_and_tenant(self):
        response = self.client.post(
            "/api/v1/categories/",
            {"name": "Mercado API", "category_type": Category.CategoryType.EXPENSE},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        category = Category.objects.get(name="Mercado API")
        self.assertEqual(category.user, self.user)
        self.assertEqual(category.tenant, self.tenant)

    def test_category_api_list_is_limited_to_current_tenant(self):
        visible = Category.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Visivel API",
            category_type=Category.CategoryType.INCOME,
        )
        Category.objects.create(
            user=self.other_user,
            name="Outra API",
            category_type=Category.CategoryType.INCOME,
        )

        response = self.client.get("/api/v1/categories/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["results"]}
        self.assertEqual(ids, {visible.pk})
